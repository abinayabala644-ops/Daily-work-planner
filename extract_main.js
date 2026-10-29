const fs = require('fs');

const prd = fs.readFileSync('c:\\Users\\abinaya\\OneDrive\\Desktop\\Time project\\extracted_prd.html', 'utf8');

// Find main tags
const startIdx = prd.indexOf('<main class="content">');
const endIdx = prd.indexOf('</main>');

if (startIdx === -1 || endIdx === -1) {
  console.error('Could not find main tags!');
  process.exit(1);
}

let mainHtml = prd.substring(startIdx, endIdx + '</main>'.length);

console.log('Original main length:', mainHtml.length);
fs.writeFileSync('c:\\Users\\abinaya\\OneDrive\\Desktop\\Time project\\original_main.html', mainHtml, 'utf8');
