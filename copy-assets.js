const fs = require('fs');
const path = require('path');

// Copy RevenueCat SDK to static directory after npm install
function copyRevenueCatAssets() {
    console.log('Copying RevenueCat assets to static directory...');
    
    const srcPath = path.join(__dirname, 'node_modules/@revenuecat/purchases-js/dist/purchases.js');
    const destPath = path.join(__dirname, 'src/piper_tts_web/static/revenuecat-purchases.js');
    
    try {
        if (fs.existsSync(srcPath)) {
            fs.copyFileSync(srcPath, destPath);
            console.log('RevenueCat SDK copied successfully to static/revenuecat-purchases.js');
        } else {
            console.log('RevenueCat SDK source file not found, checking alternatives...');
            
            // Try alternative paths
            const altPaths = [
                'node_modules/@revenuecat/purchases-js/dist/index.js',
                'node_modules/@revenuecat/purchases-js/lib/purchases.js',
                'node_modules/@revenuecat/purchases-js/build/purchases.js'
            ];
            
            for (const altPath of altPaths) {
                const fullAltPath = path.join(__dirname, altPath);
                if (fs.existsSync(fullAltPath)) {
                    fs.copyFileSync(fullAltPath, destPath);
                    console.log(`RevenueCat SDK copied from ${altPath}`);
                    return;
                }
            }
            
            console.log('Could not find RevenueCat SDK in any expected location');
        }
    } catch (error) {
        console.error('Error copying RevenueCat assets:', error);
    }
}

copyRevenueCatAssets();