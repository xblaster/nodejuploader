const { badgen } = require('badgen');
const fs = require('fs-extra');
const path = require('path');

let backPct = 0;
let frontPct = 0;

try {
    const coverageBackend = require('../back/coverage/coverage-summary.json');
    backPct = coverageBackend.total.statements.pct;
} catch (e) {
    console.warn('Backend coverage missing');
}

try {
    const coverageFrontend = require('../front/coverage/coverage-summary.json');
    frontPct = coverageFrontend.total.statements.pct;
} catch (e) {
    console.warn('Frontend coverage missing');
}

const avgPct = Math.floor((backPct + frontPct) / 2);

const svgString = badgen({
    label: 'coverage',
    status: `${avgPct}%`,
    color: avgPct > 80 ? 'green' : avgPct > 50 ? 'yellow' : 'red',
    scale: 1
});

fs.ensureDirSync(path.join(__dirname, '../docs'));
fs.writeFileSync(path.join(__dirname, '../docs/coverage.svg'), svgString);

console.log(`Badge generated: ${avgPct}%`);
