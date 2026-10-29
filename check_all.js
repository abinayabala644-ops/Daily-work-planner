const fs = require('fs');
const s = fs.readFileSync('c:\\Users\\abinaya\\OneDrive\\Desktop\\Time project\\updated_main.html', 'utf8');

const checks = [
  ['Starts with <main class="content">', s.startsWith('<main class="content">')],
  ['Ends with </main>', s.trim().endsWith('</main>')],
  ['Version 1.1.0 in Banner', s.includes('<span class="meta-value">1.1.0</span>')],
  ['Status Draft for Client Approval in Banner', s.includes('<span class="status-badge">Draft for Client Approval</span>')],
  ['Version 1.1.0 in Doc Info', s.includes('<td><strong>Document Version</strong></td>\n                <td>1.1.0</td>')],
  ['Status Draft for Client Approval in Doc Info', s.includes('<td><strong>Document Status</strong></td>\n                <td>Draft for Client Approval</td>')],
  ['Start New Day in Scope', s.includes('"Start New Day" button in the page header with an accessible confirmation dialog')],
  ['US-09 present', s.includes('US-09')],
  ['FR-21 present', s.includes('FR-21')],
  ['FR-22 present', s.includes('FR-22')],
  ['FR-23 present', s.includes('FR-23')],
  ['FR-24 present', s.includes('FR-24')],
  ['FR-25 present', s.includes('FR-25')],
  ['FR-26 present', s.includes('FR-26')],
  ['Wireframe button', s.includes('[ PAGE HEADER: DAILY WORK PLANNER - DATE | [Start New Day Button] ]')],
  ['A11y 4.5:1 contrast for message', s.includes('minimum contrast ratio of 4.5:1 for all text including the confirmation message')],
  ['User flow step 7 updated', s.includes('The user presses "Start New Day" in the page header, confirms via the confirmation message')],
  ['Accidental confirmation risk', s.includes('The user may confirm Start New Day by mistake and lose entries.')],
  ['OQ-01 Bala confirm', s.includes('Bala must confirm OQ-01')],
  ['OQ-02 Default: cleared', s.includes('Default: cleared')],
  ['OQ-03 Default: no, manual only', s.includes('Default: no, manual only')],
  ['OQ-04 Default: no', s.includes('Default: no')],
  ['OQ-05 Timeline impact', s.includes('Timeline impact: Bala must confirm the extra work')],
  ['Timeline table untouched', s.includes('Phase 1') && s.includes('Phase 5') && s.includes('Week 4 (Days 18–20)')]
];

let allPassed = true;
for (const [name, passed] of checks) {
  console.log((passed ? '✓ ' : '✗ ') + name);
  if (!passed) allPassed = false;
}
console.log('ALL PASSED:', allPassed);
