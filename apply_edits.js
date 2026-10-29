const fs = require('fs');

let main = fs.readFileSync('c:\\Users\\abinaya\\OneDrive\\Desktop\\Time project\\original_main.html', 'utf8');

// Ensure correct UTF-8 string
// 1. Version raise: 1.0.0 -> 1.1.0 in Header Banner and Document Info, and Status to "Draft for Client Approval"
main = main.replace(
  '<span class="meta-value">1.0.0 (Baseline PRD)</span>',
  '<span class="meta-value">1.1.0</span>'
);

main = main.replace(
  '<span class="status-badge">Approved for Estimation</span>',
  '<span class="status-badge">Draft for Client Approval</span>'
);

main = main.replace(
  '<td><strong>Document Version</strong></td>\n                <td>1.0.0</td>',
  '<td><strong>Document Version</strong></td>\n                <td>1.1.0</td>'
);

main = main.replace(
  '<td><strong>Document Status</strong></td>\n                <td>Final Draft for Development Planning</td>',
  '<td><strong>Document Status</strong></td>\n                <td>Draft for Client Approval</td>'
);

// 2. In Scope: Add Start New Day button and confirmation workflow in header
const inScopeTarget = '<li>Single-page, responsive web application accessible via desktop and tablet browsers.</li>';
const inScopeReplacement = `<li>Single-page, responsive web application accessible via desktop and tablet browsers.</li>
          <li>"Start New Day" button in the page header with an accessible confirmation dialog to clear all 8 working slots and all pending items for the next day.</li>`;
main = main.replace(inScopeTarget, inScopeReplacement);

// 3. Add User Story US-09
const usTableEnd = '              <tr>\n                <td><strong>US-08</strong>';
const newUS = `              <tr>
                <td><strong>US-09</strong></td>
                <td>Daily Planner User</td>
                <td>Start a new day with one button</td>
                <td>I can plan the next day without deleting every entry by hand.</td>
              </tr>
            </tbody>`;
main = main.replace('            </tbody>\n          </table>\n        </div>\n      </section>', newUS + '\n          </table>\n        </div>\n      </section>');

// 4. Add Functional Requirements FR-21 to FR-26 (priority Medium)
const frTableEnd = '              <tr>\n                <td class="req-id">FR-20</td>\n                <td>The system shall maintain all components within a unified single-page layout requiring no page reloads, external redirects, or navigation to secondary screens.</td>\n                <td><span class="badge badge-high">High</span></td>\n              </tr>\n            </tbody>';

const newFRs = `              <tr>
                <td class="req-id">FR-20</td>
                <td>The system shall maintain all components within a unified single-page layout requiring no page reloads, external redirects, or navigation to secondary screens.</td>
                <td><span class="badge badge-high">High</span></td>
              </tr>

              <!-- Start New Day Requirements -->
              <tr>
                <td class="req-id">FR-21</td>
                <td>The system shall display a "Start New Day" button in the page header.</td>
                <td><span class="badge badge-med">Medium</span></td>
              </tr>
              <tr>
                <td class="req-id">FR-22</td>
                <td>The system shall show a confirmation message when the button is clicked, with a Cancel button and a Start New Day button.</td>
                <td><span class="badge badge-med">Medium</span></td>
              </tr>
              <tr>
                <td class="req-id">FR-23</td>
                <td>The system shall clear nothing if the user clicks Cancel, presses Escape, or clicks outside the message.</td>
                <td><span class="badge badge-med">Medium</span></td>
              </tr>
              <tr>
                <td class="req-id">FR-24</td>
                <td>The system shall, after the user confirms, clear the text, checkbox, and Completed / Not Completed status of all 8 working slots, remove all Pending Work items, and empty the Pending Work form fields.</td>
                <td><span class="badge badge-med">Medium</span></td>
              </tr>
              <tr>
                <td class="req-id">FR-25</td>
                <td>The system shall never create or fill any pending item when a new day starts.</td>
                <td><span class="badge badge-med">Medium</span></td>
              </tr>
              <tr>
                <td class="req-id">FR-26</td>
                <td>The confirmation message shall be keyboard accessible, and its buttons shall be at least 44px high on mobile.</td>
                <td><span class="badge badge-med">Medium</span></td>
              </tr>
            </tbody>`;
main = main.replace(frTableEnd, newFRs);

// 5. Update Layout diagram: add [Start New Day] in header line
main = main.replace(
  '[ PAGE HEADER: DAILY WORK PLANNER - DATE ]',
  '[ PAGE HEADER: DAILY WORK PLANNER - DATE | [Start New Day Button] ]'
);

// 6. Update Non-Functional Requirements table: add contrast 4.5:1 for the message
const a11yTarget = '<td>The system shall provide accessible ARIA attributes (`aria-pressed`, `aria-label`) for all toggle buttons and maintain a minimum contrast ratio of 4.5:1.</td>';
const a11yReplacement = '<td>The system shall provide accessible ARIA attributes (`aria-pressed`, `aria-label`) for all toggle buttons, provide keyboard accessibility and a minimum 44px touch target on mobile for confirmation dialog buttons, and maintain a minimum contrast ratio of 4.5:1 for all text including the confirmation message.</td>';
main = main.replace(a11yTarget, a11yReplacement);

// 7. Update User Flow step 7
const flowStep7Target = `<div class="flow-card">
            <div class="flow-index">7</div>
            <div class="flow-details">
              <h4>End-of-Day Review & Next-Day Reuse</h4>
              <p>The user performs a final visual scan of the day's 8 slots and pending list to measure performance before closing the planner or refreshing it for the next day's schedule.</p>
            </div>
          </div>`;

const flowStep7Replacement = `<div class="flow-card">
            <div class="flow-index">7</div>
            <div class="flow-details">
              <h4>Start New Day</h4>
              <p>The user presses "Start New Day" in the page header, confirms via the confirmation message, and sees a clean planner with all 8 working slots and pending items reset for the next day.</p>
            </div>
          </div>`;
main = main.replace(flowStep7Target, flowStep7Replacement);

// 8. Update Assumptions and Risks
const risksTarget = `              <tr>
                <td><strong>Accidental Tab Closure / Refresh:</strong> User refreshes the browser page and loses all typed tasks for the current day.</td>
                <td><span class="badge badge-high">High</span></td>
                <td>Evaluate optional client-side local caching (LocalStorage) in Open Questions to persist typed data across browser sessions.</td>
              </tr>`;

const risksReplacement = `              <tr>
                <td><strong>Accidental Tab Closure / Refresh:</strong> User refreshes the browser page and loses all typed tasks for the current day.</td>
                <td><span class="badge badge-high">High</span></td>
                <td>Evaluate optional client-side local caching (LocalStorage) in Open Questions to persist typed data across browser sessions.</td>
              </tr>
              <tr>
                <td><strong>Accidental Confirmation:</strong> The user may confirm Start New Day by mistake and lose entries.</td>
                <td><span class="badge badge-med">Medium</span></td>
                <td>The confirmation message explicitly explains what will be cleared before executing the reset. No undo is included.</td>
              </tr>`;
main = main.replace(risksTarget, risksReplacement);

// 9. Update Open Questions (do not invent answers, state defaults)
const oqSectionTarget = `              <tr>
                <td><strong>OQ-01</strong></td>
                <td>Data Persistence</td>
                <td>Should the planner's entries persist locally in the user's browser (e.g., via <code>localStorage</code>) so data survives page refreshes and browser closures, or should every reload present an empty sheet?</td>
                <td>Determines whether client-side storage handlers and a "Reset / Clear Day" button need to be architected.</td>
              </tr>
              <tr>
                <td><strong>OQ-02</strong></td>
                <td>Daily Reset Workflow</td>
                <td>How should the planner transition from day to day? Should there be a manual "Clear All Slots" / "Start New Day" button, or an automatic daily midnight reset?</td>
                <td>Influences button controls on the header and daily state maintenance.</td>
              </tr>
              <tr>
                <td><strong>OQ-03</strong></td>
                <td>Date Indicator / Picker</td>
                <td>Does the user want a simple header displaying today's date (e.g., "Monday, October 19, 2026"), or should the user be able to pick dates to plan future days?</td>
                <td>Clarifies whether a static date badge or a date picker component is required in the page header.</td>
              </tr>
              <tr>
                <td><strong>OQ-04</strong></td>
                <td>Export / Print Capabilities</td>
                <td>Is there a requirement for users to print the completed daily schedule or export it as a summary (e.g., PDF or plain text summary)?</td>
                <td>Determines whether a dedicated print stylesheet and "Export to PDF" button should be added to the interface.</td>
              </tr>
              <tr>
                <td><strong>OQ-05</strong></td>
                <td>Pending Slot Input Format</td>
                <td>For the Pending Work entry time slot field, should it be a free-form text input (e.g., user types "9-10" or "Morning") or a dropdown selector listing the 8 working slots?</td>
                <td>Affects form validation and input flexibility in the Pending Work section.</td>
              </tr>`;

const oqSectionReplacement = `              <tr>
                <td><strong>OQ-01</strong></td>
                <td>Data Persistence & Reset</td>
                <td>If data is saved in the browser after a refresh (OQ-01), the new day must also clear the saved data; Bala must confirm OQ-01.</td>
                <td>Requires aligning browser storage persistence with the Start New Day reset handler.</td>
              </tr>
              <tr>
                <td><strong>OQ-02</strong></td>
                <td>Pending Items on Reset</td>
                <td>Should unresolved Pending Work items be kept when a new day starts, or cleared? (Default: cleared).</td>
                <td>Determines whether pending items are preserved across day boundaries or purged.</td>
              </tr>
              <tr>
                <td><strong>OQ-03</strong></td>
                <td>Automated Midnight Reset</td>
                <td>Should the planner start a new day automatically at midnight? (Default: no, manual only).</td>
                <td>Determines whether a background midnight timer or listener is necessary.</td>
              </tr>
              <tr>
                <td><strong>OQ-04</strong></td>
                <td>Undo Option</td>
                <td>Is an undo option needed? (Default: no).</td>
                <td>Determines whether state history buffer and undo toast UI must be built.</td>
              </tr>
              <tr>
                <td><strong>OQ-05</strong></td>
                <td>Timeline Impact</td>
                <td>Timeline impact: Bala must confirm the extra work for the Start New Day button and modal workflow.</td>
                <td>May adjust development schedule or sprint allocation.</td>
              </tr>`;
main = main.replace(oqSectionTarget, oqSectionReplacement);

fs.writeFileSync('c:\\Users\\abinaya\\OneDrive\\Desktop\\Time project\\updated_main.html', main, 'utf8');
console.log('Successfully generated updated_main.html! Length:', main.length);
