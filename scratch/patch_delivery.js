const fs = require('fs');
const path = require('path');

const deliveryHtmlPath = path.join(__dirname, '../public/admin/delivery.html');
let html = fs.readFileSync(deliveryHtmlPath, 'utf8');

// Replacements
html = html.replace('<option value="Bolt Food">Bolt Food</option>', '<option value="Bolt Food">Bolt Food</option>\n                            <option value="Own Delivery">Own Delivery</option>');
html = html.replace('<option value="Bolt Food">Bolt Food</option>', '<option value="Bolt Food">Bolt Food</option>\n                        <option value="Own Delivery">Own Delivery</option>');
html = html.replace('<option value="Bolt Food">Bolt Food</option>', '<option value="Bolt Food">Bolt Food</option>\n                        <option value="Own Delivery">Own Delivery</option>');
html = html.replace('<option value="Bolt Food">Bolt Food Only</option>', '<option value="Bolt Food">Bolt Food Only</option>\n                                <option value="Own Delivery">Own Delivery Only</option>');

// diPricesContainer
const pricesReplacement = `<div class="form-group" id="diBoltPriceGroup">
                                    <label style="font-size:0.7rem;">Bolt Price</label>
                                    <input type="number" id="diBoltPrice" class="form-control" step="0.01" placeholder="e.g. 400">
                                </div>
                                <div class="form-group" id="diOwnDeliveryPriceGroup">
                                    <label style="font-size:0.7rem;">Own Delivery Price</label>
                                    <input type="number" id="diOwnDeliveryPrice" class="form-control" step="0.01" placeholder="e.g. 400">
                                </div>`;
html = html.replace(/<div class="form-group" id="diBoltPriceGroup">[\s\S]*?<\/div>/, pricesReplacement);
html = html.replace('grid-template-columns:1fr 1fr 1fr', 'grid-template-columns:1fr 1fr 1fr 1fr');

// modal edit item
html = html.replace("document.getElementById('diBoltPrice').value = item.bolt_price || '';", "document.getElementById('diBoltPrice').value = item.bolt_price || '';\n                document.getElementById('diOwnDeliveryPrice').value = item.own_delivery_price || '';");

// toggle platform
const toggleLogic = `const boltGrp = document.getElementById('diBoltPriceGroup');
            const ownGrp = document.getElementById('diOwnDeliveryPriceGroup');

            const uberInput = document.getElementById('diUberPrice');
            const glovoInput = document.getElementById('diGlovoPrice');
            const boltInput = document.getElementById('diBoltPrice');
            const ownInput = document.getElementById('diOwnDeliveryPrice');

            // Reset transitions and display
            uberGrp.style.opacity = '1';
            glovoGrp.style.opacity = '1';
            boltGrp.style.opacity = '1';
            ownGrp.style.opacity = '1';
            uberInput.disabled = false;
            glovoInput.disabled = false;
            boltInput.disabled = false;
            ownInput.disabled = false;

            if (platform === 'Uber Eats') {
                glovoGrp.style.opacity = '0.3';
                boltGrp.style.opacity = '0.3';
                ownGrp.style.opacity = '0.3';
                glovoInput.disabled = true;
                boltInput.disabled = true;
                ownInput.disabled = true;
            } else if (platform === 'Glovo') {
                uberGrp.style.opacity = '0.3';
                boltGrp.style.opacity = '0.3';
                ownGrp.style.opacity = '0.3';
                uberInput.disabled = true;
                boltInput.disabled = true;
                ownInput.disabled = true;
            } else if (platform === 'Bolt Food') {
                uberGrp.style.opacity = '0.3';
                glovoGrp.style.opacity = '0.3';
                ownGrp.style.opacity = '0.3';
                uberInput.disabled = true;
                glovoInput.disabled = true;
                ownInput.disabled = true;
            } else if (platform === 'Own Delivery') {
                uberGrp.style.opacity = '0.3';
                glovoGrp.style.opacity = '0.3';
                boltGrp.style.opacity = '0.3';
                uberInput.disabled = true;
                glovoInput.disabled = true;
                boltInput.disabled = true;
            }`;
html = html.replace(/const boltGrp = document\.getElementById\('diBoltPriceGroup'\);[\s\S]*?glovoInput\.disabled = true;\n                boltInput\.disabled = true;\n            \}/, toggleLogic);

// form submit
html = html.replace("bolt_price: document.getElementById('diBoltPrice').value ? parseFloat(document.getElementById('diBoltPrice').value) : null,", "bolt_price: document.getElementById('diBoltPrice').value ? parseFloat(document.getElementById('diBoltPrice').value) : null,\n                own_delivery_price: document.getElementById('diOwnDeliveryPrice').value ? parseFloat(document.getElementById('diOwnDeliveryPrice').value) : null,");

// manual menu updates (there are 3 occurrences of pricing logic)
html = html.replaceAll("if (platform === 'Bolt Food' && item.bolt_price) price = Number(item.bolt_price);", "if (platform === 'Bolt Food' && item.bolt_price) price = Number(item.bolt_price);\n                if (platform === 'Own Delivery' && item.own_delivery_price) price = Number(item.own_delivery_price);");

fs.writeFileSync(deliveryHtmlPath, html, 'utf8');
console.log('delivery.html updated successfully.');
