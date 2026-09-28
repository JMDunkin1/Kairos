#!/usr/bin/env python3
"""Read two STEO supply series using Python's standard library only.

Input: retained EIA XLSX path and its original ISO release date.
Output: narrow JSON; cached formula values only, never formulas or future months.
"""
import calendar
import datetime as dt
import json
import math
from pathlib import PurePosixPath
import re
import sys
import xml.etree.ElementTree as ET
import zipfile

NS = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
RID = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id'


def column_name(number):
    name = ''
    while number:
        number, remainder = divmod(number - 1, 26)
        name = chr(65 + remainder) + name
    return name


def parse_workbook(filename, release_date):
    dt.date.fromisoformat(release_date)
    with zipfile.ZipFile(filename) as archive:
        if sum(item.file_size for item in archive.infolist()) > 128 * 1024 * 1024:
            raise ValueError('STEO workbook uncompressed size exceeds limit')
        def xml(name):
            data = archive.read(name)
            if b'<!DOCTYPE' in data.upper() or b'<!ENTITY' in data.upper():
                raise ValueError('XML entity declarations are not supported')
            return ET.fromstring(data)
        shared = []
        if 'xl/sharedStrings.xml' in archive.namelist():
            shared = [''.join(item.itertext()) for item in xml('xl/sharedStrings.xml').findall('s:si', NS)]
        relations = {item.attrib['Id']: item.attrib['Target'] for item in xml('xl/_rels/workbook.xml.rels') if item.attrib.get('TargetMode') != 'External'}
        sheets = {item.attrib['name']: relations[item.attrib[RID]] for item in xml('xl/workbook.xml').find('s:sheets', NS)}
        def sheet(name):
            target = sheets[name]
            file = str(PurePosixPath(target.lstrip('/'))) if target.startswith('/') else str(PurePosixPath('xl') / target)
            if '..' in PurePosixPath(file).parts:
                raise ValueError('Unexpected workbook sheet path')
            values = {}
            for cell in xml(file).findall('.//s:sheetData/s:row/s:c', NS):
                address = cell.attrib['r']
                if address in values:
                    raise ValueError('Duplicate worksheet cell')
                kind = cell.attrib.get('t')
                raw = cell.find('s:v', NS)
                if kind == 'inlineStr':
                    value = ''.join(cell.find('s:is', NS).itertext())
                elif raw is None:
                    value = None
                elif kind == 's':
                    value = shared[int(raw.text)]
                elif kind in ('str', 'e', 'b'):
                    value = raw.text
                else:
                    value = float(raw.text)
                values[address] = value
            return values
        dates = sheet('Dates')
        periods = [dates.get('D' + re.search(r'\d+$', address).group()) for address, value in dates.items()
                   if address.startswith('A') and isinstance(value, str) and value.strip().startswith('Last Historical Month')]
        if len(periods) != 1 or not isinstance(periods[0], (int, float)) or periods[0] != int(periods[0]):
            raise ValueError('Historical month cutoff is missing or ambiguous')
        historical = int(periods[0]); year, month = divmod(historical, 100)
        observation = dt.date(year, month, 1).strftime('%Y-%m')
        if observation >= release_date[:7]:
            raise ValueError('Historical month must be completed before original release')
        values = sheet('5atab')
        start = values.get('C3')
        if not isinstance(start, (int, float)) or start != int(start):
            raise ValueError('Unexpected STEO year header')
        col = 3 + (year - int(start)) * 12 + month - 1
        if col - 12 < 3 or values.get(column_name(col) + '4') != calendar.month_abbr[month]:
            raise ValueError('Unexpected STEO monthly column layout')
        result = {'month': observation, 'previousYearMonth': f'{year - 1:04d}-{month:02d}', 'units': 'Bcf/d', 'cells': {}}
        for series, name in [('NGPRPUS', 'Production'), ('NGEXPUS_LNG', 'Lng')]:
            matches = [address for address, value in values.items() if re.fullmatch(r'A\d+', address) and value == series]
            if len(matches) != 1:
                raise ValueError('Missing or duplicate STEO series ' + series)
            row = re.search(r'\d+$', matches[0]).group()
            current_cell, prior_cell = column_name(col) + row, column_name(col - 12) + row
            current, prior = values.get(current_cell), values.get(prior_cell)
            if not all(isinstance(v, (int, float)) and math.isfinite(v) and v > 0 for v in [current, prior]):
                raise ValueError('Invalid STEO numeric observations ' + series)
            field = 'production' if name == 'Production' else 'lng'
            result[field + 'Bcfd'] = current
            result['priorYear' + name + 'Bcfd'] = prior
            result[field + 'YoYChangeBcfd'] = current - prior
            result['cells'][series] = {'current': '5atab!' + current_cell, 'previousYear': '5atab!' + prior_cell}
        result['supplyGrowthLessLngGrowthBcfd'] = result['productionYoYChangeBcfd'] - result['lngYoYChangeBcfd']
        return result


if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('Usage: qore-eia-supply-xlsx.py workbook.xlsx YYYY-MM-DD')
    print(json.dumps(parse_workbook(sys.argv[1], sys.argv[2]), allow_nan=False))
