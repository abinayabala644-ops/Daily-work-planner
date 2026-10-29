const fs = require('fs');

const main = fs.readFileSync('c:\\Users\\abinaya\\OneDrive\\Desktop\\Time project\\original_main.html', 'utf8');

function showSection(name) {
  const start = main.indexOf('<section id="' + name + '">');
  const end = main.indexOf('</section>', start);
  console.log(`=== SECTION: ${name} ===`);
  console.log(main.substring(start, end + 10));
}

// Show header banner
console.log('=== HEADER BANNER ===');
console.log(main.substring(0, main.indexOf('<section id="doc-info">')));

showSection('doc-info');
showSection('scope');
showSection('user-stories');
showSection('functional-requirements');
showSection('non-functional-requirements');
showSection('user-flow');
showSection('assumptions-risks');
showSection('open-questions');
