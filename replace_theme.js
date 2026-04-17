const fs = require('fs');
const path = require('path');

const clientDir = path.join(__dirname, '../client/src');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(function(file) {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) { 
      results = results.concat(walk(file));
    } else { 
      if (file.endsWith('.js') || file.endsWith('.jsx')) {
        results.push(file);
      }
    }
  });
  return results;
}

const files = walk(clientDir);

files.forEach(file => {
  let c = fs.readFileSync(file, 'utf8');
  let original = c;

  // Blues to Primary (Sage)
  c = c.replace(/blue-50/g, 'primary-50');
  c = c.replace(/blue-100/g, 'primary-100');
  c = c.replace(/blue-300/g, 'primary-300');
  c = c.replace(/blue-400/g, 'primary-400');
  c = c.replace(/blue-500/g, 'primary-500');
  c = c.replace(/blue-600/g, 'primary-600');
  c = c.replace(/blue-700/g, 'primary-700');
  c = c.replace(/blue-950/g, 'primary-950');

  // Violets to Taupe
  c = c.replace(/violet-500/g, 'taupe-500');
  c = c.replace(/violet-600/g, 'taupe-600');
  c = c.replace(/violet-900/g, 'taupe-900');

  // Slates to Olive for Dark Mode Backgrounds / Borders
  // Since we use slate for text in both modes, we only replace dark mode backgrounds safely:
  c = c.replace(/dark:bg-slate-900/g, 'dark:bg-olive-900');
  c = c.replace(/dark:bg-slate-800/g, 'dark:bg-olive-800');
  c = c.replace(/dark:border-slate-800/g, 'dark:border-olive-800');
  c = c.replace(/dark:hover:bg-slate-800/g, 'dark:hover:bg-olive-800');

  // Glows
  c = c.replace(/glow-blue/g, 'glow-primary');
  c = c.replace(/glow-violet/g, 'glow-taupe');

  // Light Mode Text Dark Slate
  c = c.replace(/text-slate-900/g, 'text-slate-dark');

  if (c !== original) {
    fs.writeFileSync(file, c);
    console.log('Updated:', file);
  }
});
