const fs = require('fs');

const main = fs.readFileSync('c:\\Users\\abinaya\\OneDrive\\Desktop\\Time project\\original_main.html', 'utf8');

// Check last FR number
const frMatches = [...main.matchAll(/FR-(\d+)/g)];
console.log('Highest FR:', frMatches.map(m => parseInt(m[1])).sort((a,b)=>b-a)[0]);

// Check last US number
const usMatches = [...main.matchAll(/US-(\d+)/g)];
console.log('Highest US:', usMatches.map(m => parseInt(m[1])).sort((a,b)=>b-a)[0]);

// Check sections
const sections = [...main.matchAll(/<section id="([^"]+)">/g)].map(m => m[1]);
console.log('Sections:', sections);
