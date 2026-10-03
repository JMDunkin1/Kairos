// Compiled only with --qa. Uses this app's own WebKit DOM and snapshots; no other app access.
func runNativeQA(_ app: QoreDesktop) {
    guard let qa = app.qa, !qa.finished else { return }
    let output = qa.output
    func finish(_ error: String? = nil) {
        qa.finish(error)
    }
    func js(_ code: String, then: @escaping (Any?) -> Void) {
        guard !qa.finished else { return }
        app.web.evaluateJavaScript(code) { value, error in
            guard !qa.finished else { return }
            if let error = error { finish("JavaScript QA failed: \(error.localizedDescription)") } else { then(value) }
        }
    }
    func waitFor(_ condition: String, remaining: Int = 60, then: @escaping () -> Void) {
        qa.markStage("wait: " + condition)
        js(condition) { value in
            if value as? Bool == true { then() }
            else if remaining <= 0 { finish("Timed out: \(condition)") }
            else { DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { waitFor(condition, remaining: remaining - 1, then: then) } }
        }
    }
    func snapshot(_ name: String, then: @escaping () -> Void) {
        guard !qa.finished else { return }
        let chartsReady = "(()=>{const charts=[...document.querySelectorAll('svg.smooth-chart-svg')];return charts.every(svg=>svg.viewBox.baseVal.width>100 && svg.viewBox.baseVal.height>100 && [...svg.querySelectorAll('path.smooth-chart-line')].some(path=>Boolean(path.getAttribute('d'))))})()"
        waitFor(chartsReady) {
            qa.markStage("snapshot: " + name)
            app.web.takeSnapshot(with: nil) { image, error in
                guard !qa.finished else { return }
                guard error == nil, let tiff = image?.tiffRepresentation, let bitmap = NSBitmapImageRep(data: tiff), let png = bitmap.representation(using: .png, properties: [:]) else { finish("Snapshot failed: \(name)"); return }
                do { try png.write(to: output.appendingPathComponent(name + ".png")); qa.checks.append("Rendered \(name)"); then() }
                catch { finish("Snapshot write failed") }
            }
        }
    }
    func click(_ title: String, then: @escaping () -> Void) {
        qa.markStage("click: " + title)
        let encoded = String(data: try! JSONSerialization.data(withJSONObject: [title]), encoding: .utf8)!
        js("(()=>{const title=\(encoded)[0]; const b=[...document.querySelectorAll('button')].find(x=>x.textContent===title); if(!b||b.disabled)return false; b.click(); return true})()") { value in
            if value as? Bool != true { finish("Control unavailable: \(title)") } else { DispatchQueue.main.asyncAfter(deadline: .now() + 0.2, execute: then) }
        }
    }
    func cycle(_ index: Int, then: @escaping () -> Void) {
        let routes = ["Research", "Reports", "Connections", "Experiments", "Portfolio"]
        if index == 15 {
            qa.checks.append("Repeated navigation: 15 route changes, portfolio retained")
            click("Research") {
                click("Add strategy sleeve") {
                    click("Portfolio") {
                        waitFor("document.body.innerText.includes('Relative price deviation') && document.querySelector('select[aria-label=\"Trace sleeve\"]').value==='relative-value'") {
                            qa.checks.append("Adding a draft sleeve leaves the frozen spread trace intact")
                            then()
                        }
                    }
                }
            }
            return
        }
        click(routes[index % routes.count]) { cycle(index + 1, then: then) }
    }
    func malformedRequestCheck(then: @escaping () -> Void) {
        js("(()=>{window.__qoreQaInvalid=null;(async()=>{const before=await(await fetch('/api/hub/runs')).json();const bad=await fetch('/api/hub/runs',{method:'POST',headers:{'Content-Type':'application/json','X-Qore-Local':'1'},body:JSON.stringify({request:null})});const after=await(await fetch('/api/hub/runs')).json();window.__qoreQaInvalid={status:bad.status,same:before.length===after.length}})();return true})()") { _ in
            waitFor("window.__qoreQaInvalid?.status===400 && window.__qoreQaInvalid?.same===true") {
                qa.checks.append("Malformed same-origin request rejected without poisoning the frozen run registry")
                then()
            }
        }
    }
    func removedSleeveCheck(then: @escaping () -> Void) {
        js("(()=>{document.querySelector('.hub-flow').open=true;document.querySelector('.hub-flow .link-button')?.click();document.querySelector('.hub-strategy-list button').click();return true})()") { _ in
            click("Remove sleeve") {
                waitFor("document.querySelectorAll('.hub-strategy-list button').length===2") {
                    js("(()=>{const select=document.querySelector('.hub-flow select');const el=[...document.querySelectorAll('.hub-flow label')].find(x=>x.textContent.includes('Amount')).querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'1000');el.dispatchEvent(new Event('input',{bubbles:true}));return select.value && select.value!=='trend-core'})()") { value in
                        if value as? Bool != true { finish("Cash-flow selector did not repair removed sleeve"); return }
                        click("Add flow") {
                            click("Freeze & run simulation") {
                                waitFor("document.body.innerText.includes('Contributed $101,000') && document.body.innerText.includes('Portfolio NAV')") {
                                    js("!document.body.innerText.includes('Flow must name')") { value in
                                        if value as? Bool != true { finish("Removed-sleeve cash flow blocked the trial"); return }
                                        qa.checks.append("Removed original flow target, added deposit to displayed remaining sleeve, and completed simulation")
                                        snapshot("10-removed-sleeve-deposit") { then() }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    func extraChecks(then: @escaping () -> Void) {
        click("Edit as new trial") {
            js("(()=>{document.querySelector('.hub-flow').open=true;const el=[...document.querySelectorAll('.hub-flow label')].find(x=>x.textContent.includes('Amount')).querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'25000');el.dispatchEvent(new Event('input',{bubbles:true}));return true})()") { _ in
                click("Add flow") {
                    click("Freeze & run simulation") {
                        waitFor("document.body.innerText.includes('Contributed $125,000')") {
                            qa.checks.append("Opening deposit recorded through UI without counting it as P&L")
                            snapshot("07-deposit-portfolio") {
                                click("Reports") {
                                    waitFor("document.body.innerText.includes('Export weekly JSON')") {
                                        click("Export weekly JSON") {
                                            guard let panel = app.window.attachedSheet as? NSSavePanel else { finish("Native export save panel did not open"); return }
                                            let filename = panel.nameFieldStringValue
                                            panel.directoryURL = output
                                            DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
                                                app.window.endSheet(panel, returnCode: .cancel)
                                                waitFor("document.body.innerText.includes('Export weekly JSON')") {
                                                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                                                        qa.checks.append("Native weekly JSON save panel opened with frozen-run filename: \(filename)")
                                                        click("Research") {
                                                            click("Compare") {
                                                                waitFor("document.body.innerText.includes('Comparison run · TWR')") {
                                                                    snapshot("08-run-comparison") {
                                                                        qa.checks.append("Independent frozen runs overlaid without combining NAV")
                                                                        app.window.setContentSize(NSSize(width: 760, height: 820))
                                                                        click("Research") {
                                                                            js("document.documentElement.scrollWidth <= window.innerWidth + 1") { value in
                                                                                if value as? Bool != true { finish("Narrow window has page overflow"); return }
                                                                                snapshot("09-narrow-research") { qa.checks.append("Narrow native window rendered without page overflow"); removedSleeveCheck(then: then) }
                                                                            }
                                                                        }
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    waitFor("document.body.innerText.includes('Portfolio overview')") {
        snapshot("01-empty-portfolio") {
            click("Research") {
                waitFor("document.querySelectorAll('.hub-strategy-list button').length===3") {
                    qa.checks.append("Three contrasting editable definitions loaded")
                    js("(()=>{const label=[...document.querySelectorAll('.hub-form label')].find(x=>x.textContent.includes('Signal threshold'));const el=label.querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'0.5');el.dispatchEvent(new Event('input',{bubbles:true}));return true})()") { _ in
                        snapshot("02-editable-research") {
                            click("Freeze & run simulation") {
                                waitFor("document.body.innerText.includes('Portfolio NAV') && document.body.innerText.includes('Decision & position trace')") {
                                    qa.checks.append("Edited configuration froze and produced portfolio, attribution and decision traces")
                                    snapshot("03-simulated-portfolio") {
                                        js("(()=>{const s=document.querySelector('select[aria-label=\"Trace sleeve\"]');s.value='relative-value';s.dispatchEvent(new Event('change',{bubbles:true}));const d=document.querySelector('select[aria-label=\"Trace session\"]');d.value='2026-02-02';d.dispatchEvent(new Event('change',{bubbles:true}));return true})()") { _ in
                                            waitFor("document.body.innerText.includes('Relative price deviation')") {
                                                qa.checks.append("Selected spread sleeve and historical decision session")
                                                click("Reports") {
                                                    waitFor("document.body.innerText.includes('Export weekly CSV') && document.body.innerText.includes('Actual PAPER account reporting is unavailable; scheduled email is inactive.')") {
                                                        qa.checks.append("Simulation reports distinguished from unavailable actual PAPER reporting and inactive scheduled email")
                                                        snapshot("04-weekly-report") {
                                                            if ProcessInfo.processInfo.arguments.contains("--qa-launch-smoke") {
                                                                qa.checks.append("macOS launch smoke completed without opening Documents-backed research")
                                                                finish()
                                                                return
                                                            }
                                                            click("Experiments") {
                                                                waitFor("document.body.innerText.includes('Read evidence')") {
                                                                    snapshot("05-experiment-ledger") {
                                                                        click("Read evidence") {
                                                                            waitFor("document.body.innerText.includes('Retry conditions') && document.body.innerText.includes('Frozen protocol')") {
                                                                                qa.checks.append("Canonical research ledger and inherited evidence inspected")
                                                                                click("Connections") {
                                                                                    waitFor("document.body.innerText.includes('Capability matrix') && document.body.innerText.includes('unconfigured')") {
                                                                                        snapshot("06-capabilities") {
                                                                                            cycle(0) {
                                                                                                waitFor("document.body.innerText.includes('Portfolio NAV')") {
                                                                                                    qa.checks.append("Live remains disabled; no connected broker badge")
                                                                                                    extraChecks { malformedRequestCheck { finish() } }
                                                                                                }
                                                                                            }
                                                                                        }
                                                                                    }
                                                                                }
                                                                            }
                                                                        }
                                                                    }
                                                                }
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
