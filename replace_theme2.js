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

  // Replace light slates with taupe to warm up the borders and light backgrounds
  c = c.replace(/slate-50/g, 'taupe-50');
  c = c.replace(/slate-100/g, 'taupe-100');
  c = c.replace(/slate-200/g, 'taupe-200');

  // Replace mid-tone slates with taupe to warm up secondary text
  c = c.replace(/text-slate-400/g, 'text-taupe-400');
  c = c.replace(/text-slate-500/g, 'text-taupe-500');
  c = c.replace(/text-slate-600/g, 'text-taupe-600');
  
  c = c.replace(/border-slate-400/g, 'border-taupe-400');
  c = c.replace(/border-slate-500/g, 'border-taupe-500');

  // Let's replace 'dark:border-white/10' which might be too stark with 'dark:border-taupe-500/20'
  c = c.replace(/dark:border-white\/10/g, 'dark:border-taupe-500/20');
  c = c.replace(/dark:border-white\/5/g, 'dark:border-taupe-500/10');
  c = c.replace(/dark:border-white\/8/g, 'dark:border-taupe-500/15');

  if (c !== original) {
    fs.writeFileSync(file, c);
    console.log('Warmed up:', file);
  }
});
