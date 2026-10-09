export function paperOutcomeLabel(status: string): string {
  if (status === 'ORIGINAL_DEVELOPMENT_SELECTION_FAILED_PRESERVED') return 'Original selection failed'
  if (status === 'ORIGINAL_RETURN_AND_STABILITY_SCREENS_FAILED_PRESERVED') return 'Return and stability screens failed'
  return status.replaceAll('_', ' ').toLowerCase()
}

export function paperControlLabel(control: string): string {
  const labels: Record<string, string> = { btc_buyhold: 'BTC buy & hold', monthly_50_cash: '50% monthly cash', cash: 'Cash', portfolio_mix: 'Portfolio mix', portfolio_cash: 'Portfolio cash' }
  return labels[control] ?? control.replaceAll('_', ' ')
}
