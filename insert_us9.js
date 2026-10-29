const fs = require('fs');

let main = fs.readFileSync('c:\\Users\\abinaya\\OneDrive\\Desktop\\Time project\\updated_main.html', 'utf8');

const target = `              <tr>
                <td><strong>US-08</strong></td>
                <td>Daily Planner User</td>
                <td>Be guaranteed that the system will never auto-fill or auto-migrate tasks between sections</td>
                <td>I maintain complete personal ownership over what gets written in my planner.</td>
              </tr>
            </tbody>`;

const replacement = `              <tr>
                <td><strong>US-08</strong></td>
                <td>Daily Planner User</td>
                <td>Be guaranteed that the system will never auto-fill or auto-migrate tasks between sections</td>
                <td>I maintain complete personal ownership over what gets written in my planner.</td>
              </tr>
              <tr>
                <td><strong>US-09</strong></td>
                <td>Daily Planner User</td>
                <td>Start a new day with one button</td>
                <td>I can plan the next day without deleting every entry by hand.</td>
              </tr>
            </tbody>`;

if (main.includes(target)) {
  main = main.replace(target, replacement);
  fs.writeFileSync('c:\\Users\\abinaya\\OneDrive\\Desktop\\Time project\\updated_main.html', main, 'utf8');
  console.log('Successfully inserted US-09!');
} else {
  console.error('Target for US-08 not found!');
}
