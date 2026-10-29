const fs = require('fs');
const path = require('path');

function search() {
  const dir = 'C:\\Users\\abinaya\\.gemini\\antigravity-ide\\brain';
  const brainDirs = fs.readdirSync(dir);
  for (const b of brainDirs) {
    const logDir = path.join(dir, b, '.system_generated', 'logs');
    if (!fs.existsSync(logDir)) continue;
    const logFiles = fs.readdirSync(logDir);
    for (const lf of logFiles) {
      if (lf.startsWith('transcript') && lf.endsWith('.jsonl')) {
        const fullPath = path.join(logDir, lf);
        const data = fs.readFileSync(fullPath, 'utf8');
        if (data.includes('FR-18') || data.includes('Product Requirements Document')) {
          console.log('Found in:', fullPath);
          const lines = data.split('\n');
          for (const l of lines) {
            if (!l.trim()) continue;
            try {
              const obj = JSON.parse(l);
              const text = obj.content || '';
              if (typeof text === 'string' && text.includes('FR-18') && text.includes('<main class="content">')) {
                console.log('MATCHED PRD HTML! Length:', text.length, 'in step:', obj.step_index);
                fs.writeFileSync('C:\\Users\\abinaya\\OneDrive\\Desktop\\Time project\\extracted_prd.html', text, 'utf8');
                return;
              }
            } catch(e) {}
          }
        }
      }
    }
  }
}

search();
