const fs = require('fs');
const dir = process.argv[2];
const ss = fs.existsSync(dir + '/xl/sharedStrings.xml') ? fs.readFileSync(dir + '/xl/sharedStrings.xml', 'utf8') : '';
const strings = [...ss.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(''));
const dec = (s) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&apos;/g, "'").replace(/&quot;/g, '"');
const names = [...fs.readFileSync(dir + '/xl/workbook.xml', 'utf8').matchAll(/<sheet [^>]*name="([^"]*)"/g)].map((m) => m[1]);
names.forEach((name, i) => {
    const xml = fs.readFileSync(`${dir}/xl/worksheets/sheet${i + 1}.xml`, 'utf8');
    console.log(`===== ${name}`);
    for (const row of xml.matchAll(/<row [^>]*>([\s\S]*?)<\/row>/g)) {
        const cells = [...row[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)].map((c) => {
            const t = (c[2].match(/t="(\w+)"/) || [])[1];
            const v = ((c[3] || '').match(/<v>([\s\S]*?)<\/v>/) || [])[1];
            const is = ((c[3] || '').match(/<t[^>]*>([\s\S]*?)<\/t>/) || [])[1];
            const val = t === 's' ? strings[Number(v)] : t === 'inlineStr' ? is : v;
            return val != null && val !== '' ? `${c[1]}=${dec(String(val))}` : null;
        }).filter(Boolean);
        if (cells.length) console.log(cells.join(' | '));
    }
});
