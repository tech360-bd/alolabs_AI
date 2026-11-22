const fs = require('fs');
const path = '/home/user/alolabs_AI/src/lib/minio.ts';
const content = fs.readFileSync(path, 'utf8');
const oldLine = "  const normalized = key.replace(/\\\\\\\\/g, '/').replace(/^\\\\\\\\/+/, '');";
const newLine = "  const normalized = key.replace(/\\//g, '/').replace(/^\\/+/g, '');";
if (content.includes(oldLine)) {
  fs.writeFileSync(path, content.replace(oldLine, newLine));
  console.log("Fixed minio.ts");
} else {
  console.error("Line not found");
  console.log("Line 41:", content.split('\\n')[40]);
}
