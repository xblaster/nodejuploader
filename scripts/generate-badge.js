const { badgen } = require('badgen');
const fs = require('fs-extra');
const path = require('path');

// Read coverage summary
const coverageBackend = require('../back/coverage/coverage-summary.json');
const coverageFrontend = require('../front/coverage/coverage-summary.json');

// Calculate average or specific (e.g., statements)
const backPct = coverageBackend.total.statements.pct;
const frontPct = coverageFrontend.total.statements.pct;

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
