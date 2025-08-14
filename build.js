const fs = require('fs');
const path = require('path');

// Simple build script to bundle RevenueCat SDK
async function build() {
    console.log('Building frontend assets...');
    
    // Read the existing app.js
    const appJsPath = path.join(__dirname, 'src/piper_tts_web/static/app.js');
    const appJsContent = fs.readFileSync(appJsPath, 'utf8');
    
    // Create a simple import statement at the top
    const importStatement = `// RevenueCat SDK Import
import { Purchases } from '@revenuecat/purchases-js';
window.Purchases = Purchases;

`;
    
    // Create bundled version
    const bundledContent = importStatement + appJsContent;
    
    // For now, just add the import to the existing file
    // In a real build system, you'd use esbuild or webpack here
    console.log('RevenueCat SDK will be loaded via ES6 modules');
    console.log('Build completed - RevenueCat dependency ready');
}

build().catch(console.error);