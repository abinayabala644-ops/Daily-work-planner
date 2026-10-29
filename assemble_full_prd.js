const fs = require('fs');

const original = fs.readFileSync('c:\\Users\\abinaya\\OneDrive\\Desktop\\Time project\\extracted_prd.html', 'utf8');
const updatedMain = fs.readFileSync('c:\\Users\\abinaya\\OneDrive\\Desktop\\Time project\\updated_main.html', 'utf8');

const headPart = original.substring(0, original.indexOf('<main class="content">'));

const fullHtml = headPart + updatedMain + `
  </div>

</body>
</html>
`;

fs.writeFileSync('c:\\Users\\abinaya\\OneDrive\\Desktop\\Time project\\PRD_v1.1.0_Daily_Work_Planner.html', fullHtml, 'utf8');
console.log('Saved standalone PRD to PRD_v1.1.0_Daily_Work_Planner.html');
