let initialMaterials = {}; 
const urlParams = new URLSearchParams(window.location.search);
const isDebugMode = urlParams.has('debug') && urlParams.get('debug') === 'true';

const LEVELS = [1, 5, 10, 15, 20, 25];
const allMaterials = Object.values(materials).reduce((acc, season) => {
    return { ...acc, ...season.mats };
}, {});
const materialToSeason = {};
Object.values(materials).forEach(season => {
    Object.keys(season.mats).forEach(mat => {
        materialToSeason[mat] = season.season;
    });
});
let qualityMultipliers = {};
const WARLORD_PENALTY = 3;
const LEFTOVER_WEIGHT = 5;

document.addEventListener('DOMContentLoaded', function() {
    createLevelStructure();
    addCalculateButton();
	formatedInputNumber();
	inputActive();
	initAdvMaterialSection();
	
    // Kun footerin sisällä olevaa SVG:tä painetaan
    document.querySelectorAll('footer svg, #openGiftFromHeader').forEach(element => {
		element.addEventListener('click', function() {
			const pageDivs = document.querySelectorAll('.wrapper > div');
			const giftDiv = document.querySelector('.wrapper .gift');

			pageDivs.forEach(div => {
				div.style.display = 'none';
			});
			giftDiv.style.display = 'flex';
			gtag('event', 'donate_click', {
				'event_label_gift': 'Open domnate views'
			});
		});
	});

    document.querySelector('.gift button').addEventListener('click', function() {
        const pageDivs = document.querySelectorAll('.wrapper > div');
        const wrapperDiv = document.querySelector('#generatebychoice');

        pageDivs.forEach(div => {
            div.style.display = 'none';
        });

        wrapperDiv.style.display = 'block';
    });
});

function formatPlaceholderWithCommas(number) {
    return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatedInputNumber(){
	document.addEventListener('input', function(e) {
		if (e.target.classList.contains('numeric-input')) {
			let inputValue = e.target.value;

			// Poista kaikki muut merkit paitsi numerot ja pilkut
			let numericValue = inputValue.replace(/[^0-9,]/g, '');

			// Muunna numero USA-formaattiin
			let formattedValue = numericValue
				.replace(/,/g, '') // Poista ensin olemassa olevat pilkut, jotta ne eivät häiritse
				.replace(/\B(?=(\d{3})+(?!\d))/g, ","); // Lisää pilkut joka kolmannen numeron jälkeen

			e.target.value = formattedValue;
		}
	});

}

function getQualityMultiplier(levelName) {
    const order = ['poor', 'common', 'fine', 'exquisite', 'epic', 'legendary'];
    const idx = order.indexOf(levelName.toLowerCase());
    return Math.pow(4, idx >= 0 ? idx : 0);
}


function setTemplateValues(templates) {
    // Tyhjennä ensin kaikki aikaisemmat valinnat
    document.querySelectorAll('#manualInput input[type="number"]').forEach(input => {
        input.value = ''; // Nollaa kaikki input-kentät
    });

    // Aseta sitten uudet arvot
    Object.entries(templates).forEach(([level, items]) => {
        Object.entries(items).forEach(([itemName, amount]) => {
            const inputElement = document.querySelector(`input[name="${itemName}"]`);
            if (inputElement) {
                inputElement.value = amount;
            }
        });
    });
}

// Oletetaan, että addCalculateButton-funktio on jo määritelty ja se lisää sekä Laske että Generoi 480 -napit
function addCalculateButton() {
    const manualInputDiv = document.getElementById('manualInput');
	const generatebychoice = document.getElementById('generatebychoice');
    
    const calculateBtn = document.createElement('button');
    calculateBtn.textContent = 'Calculate';
	calculateBtn.classList.add('calculate-button'); 
    calculateBtn.addEventListener('click', calculateMaterials);
    manualInputDiv.appendChild(calculateBtn);
}

// Funktio tulosten näyttämiseen (modifioi tämä toimimaan haluamallasi tavalla)
function showResults() {
	document.getElementById('results').style.display = 'block';
	document.getElementById('generatebychoice').style.display = 'none';
	window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
	
    document.querySelector('.spinner-wrap').classList.remove('active');

}

function closeResults() {
	const resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = ''; // Tyhjennä aiemmat tulokset
	document.getElementById('results').style.display = 'none';
	document.getElementById('generatebychoice').style.display = 'block';
}

function createCloseButton(parentElement) {
    const closeButton = document.createElement('button');
    closeButton.id = 'closeResults';
    closeButton.onclick = closeResults;
    closeButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 384 512"><path d="M345 137c9.4-9.4 9.4-24.6 0-33.9s-24.6-9.4-33.9 0l-119 119L73 103c-9.4-9.4-24.6-9.4-33.9 0s-9.4 24.6 0 33.9l119 119L39 375c-9.4 9.4-9.4 24.6 0 33.9s24.6 9.4 33.9 0l119-119L311 409c9.4 9.4 24.6 9.4 33.9 0s9.4-24.6 0-33.9l-119-119L345 137z"/></svg>`;
    parentElement.appendChild(closeButton);
}

function createLevelStructure() {
    const manualInputDiv = document.getElementById('manualInput');
    //manualInputDiv.style.display = 'block'; // Aseta näkyväksi

    LEVELS.forEach(level => {
        const levelHeader = document.createElement('h3');
        levelHeader.textContent = `Level ${level}`;
        levelHeader.style.cursor = 'pointer'; // Osoittaa, että elementtiä voi klikata
        manualInputDiv.appendChild(levelHeader);

        const itemsDiv = document.createElement('div');
        itemsDiv.id = `level-${level}-items`;
        // Aseta Level 1 näkyväksi ja muut piiloon
        if (level === 1) {
            itemsDiv.style.display = 'block'; // Aseta Level 1 itemit näkyviksi
        } else {
            itemsDiv.style.display = 'none'; // Muut tasot piiloon oletuksena
        }
        manualInputDiv.appendChild(itemsDiv);

        // Togglea itemsDivin näkyvyyttä klikattaessa
        levelHeader.addEventListener('click', () => {
            itemsDiv.style.display = itemsDiv.style.display === 'none' ? 'block' : 'none';
        });

        // Lisää kunkin tason itemit niiden containeriin
        craftItem.products.filter(product => product.level === level).forEach(product => {
            const productDiv = document.createElement('div');
            const label = document.createElement('label');
            label.textContent = product.name;
            const input = document.createElement('input');
            input.type = 'number';
            input.name = product.name;
            input.placeholder = 'amount';

            productDiv.appendChild(label);
            productDiv.appendChild(input);
            itemsDiv.appendChild(productDiv);
        });
    });
}

function calculateMaterials() {
	
    const resultsDiv = document.getElementById('results');
    //resultsDiv.innerHTML = ''; // Tyhjennä aiemmat tulokset

    const materialsDiv = document.createElement('div');
    materialsDiv.className = 'materials';
    resultsDiv.appendChild(materialsDiv);

    // Täytä materialsDiv materiaalien tiedoilla...

    const templateCounts = { 1: [], 5: [], 10: [], 15: [], 20: [], 25: [] };
    const materialCounts = {};
	const remainingUse = {};
    
    // Kerää tiedot kaikista syötetyistä itemeistä
    document.querySelectorAll('div[id^="level-"]').forEach(levelDiv => {
        const level = parseInt(levelDiv.id.split('-')[1]);
        levelDiv.querySelectorAll('input[type="number"]').forEach(input => {
            const amount = parseInt(input.value) || 0;
            const productName = input.name;
            //const product = craftItem.products.find(p => p.name === productName);
			const product = craftItem.products.find(p => p.name === productName && p.level === level);

    
            if (product && amount > 0) {
                templateCounts[level].push({ name: productName, amount: amount, img: product.img, materials: product.materials, multiplier: qualityMultipliers[level] || 1 });
    
                Object.entries(product.materials).forEach(([rawName, requiredAmount]) => {
					const materialName = Object.keys(allMaterials).find(
						key => key.toLowerCase().replace(/\s/g, '-') === rawName.toLowerCase().replace(/\s/g, '-')
					) || rawName;

                    if (!materialCounts[materialName]) {
						materialCounts[materialName] = {
							amount: 0,
							img: allMaterials[materialName] ? allMaterials[materialName].img : ''
						};
					}
					const multiplier = qualityMultipliers[level] || 1;
					materialCounts[materialName].amount += requiredAmount * amount * multiplier;
                });
            }
        });
    });
	Object.entries(materialCounts)
        .sort(([aName], [bName]) => {
            const seasonA = materialToSeason[aName] || 0;
            const seasonB = materialToSeason[bName] || 0;
            if (seasonA !== seasonB) {
                return seasonA - seasonB;
            }
            return aName.localeCompare(bName);
        })
        .forEach(([materialName, data]) => {
        const materialContainer = document.createElement('div');
        const img = document.createElement('img');
        img.src = data.img; // Oleta, että osoittaa materiaalin kuvaan
        img.alt = materialName;
        materialContainer.appendChild(img);

        const pMatName = document.createElement('p');
        const pMatAmount = document.createElement('p');
        const pRemaining = document.createElement('p');
        const pAvailableMaterials = document.createElement('p');
        pMatName.className = 'name';
        pMatAmount.className = 'amount';
        pRemaining.className = 'remaining-to-use';
        pAvailableMaterials.className = 'available-materials';
		
		//pMatName.textContent = `${materialName}`;
		pMatName.textContent = allMaterials[materialName] ? allMaterials[materialName]["Original-name"] || materialName : materialName;
        pMatAmount.textContent = `-${new Intl.NumberFormat('en-US').format(data.amount)}`;
		pRemaining.textContent = pMatAmount.textContent;
        remainingUse[materialName] = data.amount;
		// Laske ja näytä jäljellä oleva materiaalimäärä
		const matchedKey = Object.keys(initialMaterials).find(
			key => key.toLowerCase().replace(/\s/g, '-') === materialName.toLowerCase().replace(/\s/g, '-')
		);
		const originalAmount = matchedKey ? initialMaterials[matchedKey] : 0;

		
		if(originalAmount>0){
			const remainingAmount = originalAmount - data.amount;
			if(remainingAmount>=0){
				pAvailableMaterials.textContent = `${new Intl.NumberFormat('en-US').format(remainingAmount)}`;
			}
		}
		
		
        materialContainer.dataset.material = materialName;
        materialContainer.appendChild(pMatName);
        materialContainer.appendChild(pMatAmount);
        materialContainer.appendChild(pRemaining);
        materialContainer.appendChild(pAvailableMaterials);

        materialsDiv.appendChild(materialContainer);
    });
	
	
    // Luo generateDiv ja lisää se heti materialsDivin jälkeen
    const generateDiv = document.createElement('div');
    generateDiv.className = 'generate';
    materialsDiv.after(generateDiv);

    // Lisää kerroin-napit generateDiviin, jos tarpeen (x2, x3, x4)...

    // Tarkista, ovatko kaikkien tasojen item-määrät samat
    const levelItemCounts = calculateTotalItemsByLevel(templateCounts);
    const allSameCount = areAllCountsSame(levelItemCounts);

    if (allSameCount && levelItemCounts["1"] > 0) {
        // Jos kaikkien tasojen määrät ovat samat, lisää "Total templates" -teksti materialsDivin jälkeen
        const totalTemplatesHeader = document.createElement('h2');
        totalTemplatesHeader.textContent = `Total templates: ${new Intl.NumberFormat('en-US').format(levelItemCounts["1"])} pcs`;
	
		if (!isDebugMode){
			gtag('event', 'total_templates', {
				'event_total_templates': levelItemCounts,
				'value': 1
			});
		}
		
        materialsDiv.after(totalTemplatesHeader);
        totalTemplatesHeader.after(generateDiv); // generateDiv lisätään totalTemplatesHeaderin jälkeen
    } else {
        materialsDiv.after(generateDiv); // Jos määrät eivät ole samat, generateDiv lisätään materialsDivin jälkeen
    }

    // Luo itemsDiv kaikille itemeille yhteisesti ja lisää se generateDivin jälkeen
    const itemsDiv = document.createElement('div');
    itemsDiv.className = 'items';
    allSameCount ? generateDiv.after(itemsDiv) : generateDiv.after(itemsDiv);

    // Lisää itemit ja tasot itemsDiviin
    Object.entries(templateCounts).forEach(([level, templates]) => {
        if (templates.length > 0) {
            const levelHeader = document.createElement('h4');
			levelHeader.textContent = allSameCount ? `Level ${level}` : `Level ${level} (${new Intl.NumberFormat('en-US').format(levelItemCounts[level])} pcs)`;

            itemsDiv.appendChild(levelHeader);
			


            const levelGroup = document.createElement('div');
            levelGroup.className = 'level-group';
            itemsDiv.appendChild(levelGroup);

             templates.forEach(template => {
                const templateDiv = document.createElement('div');
                const img = document.createElement('img');
                img.src = template.img;
                img.alt = template.name;
                templateDiv.appendChild(img);
				
				if (template.season && template.season !== 0) {
                    const pSetName = document.createElement('p');
                    pSetName.className = 'set-name';
                    pSetName.textContent = template.setName || '';
                    templateDiv.appendChild(pSetName);

                    const pSeasonInfo = document.createElement('p');
                    pSeasonInfo.className = 'season-info';
                    pSeasonInfo.textContent = `Season ${template.season}`;
                    templateDiv.appendChild(pSeasonInfo);
                }

                const pTemplateName = document.createElement('p');
                const pTemplateamount = document.createElement('p');
                pTemplateName.className = 'name';
                pTemplateamount.className = 'amount';

                pTemplateName.textContent = `${template.name}`;
                pTemplateamount.textContent = `${new Intl.NumberFormat('en-US').format(template.amount)}`;

                templateDiv.appendChild(pTemplateName);
                templateDiv.appendChild(pTemplateamount);

                const matsDiv = document.createElement('div');
                matsDiv.className = 'item-mats';
                const materialUsage = {};
                Object.entries(template.materials).forEach(([mat, amt]) => {
                    const totalAmt = amt * template.amount * (template.multiplier || 1);
                    materialUsage[mat] = totalAmt;
                    const pLine = document.createElement('p');
                    pLine.className = 'item-material';
                    pLine.innerHTML = `${mat} <span>${new Intl.NumberFormat('en-US').format(totalAmt)}</span>`;
                    matsDiv.appendChild(pLine);
                });
                templateDiv.dataset.materials = JSON.stringify(materialUsage);
                templateDiv.appendChild(matsDiv);

                templateDiv.addEventListener('click', function() {
                    this.classList.toggle('opacity');
                    const used = JSON.parse(this.dataset.materials);
                    const done = this.classList.contains('opacity');
                    Object.entries(used).forEach(([mat, amt]) => {
                        if (done) {
                            remainingUse[mat] -= amt;
                        } else {
                            remainingUse[mat] += amt;
                        }
                        const target = materialsDiv.querySelector(`div[data-material="${mat}"] .remaining-to-use`);
                        if (target) {
                            target.textContent = `-${new Intl.NumberFormat('en-US').format(remainingUse[mat])}`;
                        }
                    });
                });

                levelGroup.appendChild(templateDiv);
            });
        }
    });

    // Lisää sulje-nappi
    createCloseButton(resultsDiv);
    showResults();
}

function calculateTotalItemsByLevel(templateCounts) {
    let totalItemsByLevel = {};

    // Käydään läpi jokainen taso templateCounts-objektissa
    Object.keys(templateCounts).forEach(level => {
        // Laske tämän tason kaikkien templatejen määrät yhteen
        const totalItems = templateCounts[level].reduce((sum, template) => sum + template.amount, 0);
        totalItemsByLevel[level] = totalItems;
    });

    return totalItemsByLevel;
}

function areAllCountsSame(levelItemCounts) {
    const counts = Object.values(levelItemCounts);
    return counts.every(count => count === counts[0]);
}

function createMaterialImageElement(materialName, imgUrl, preference) {
    const imgElement = document.createElement('img');
    imgElement.src = imgUrl;
    imgElement.alt = materialName;
    imgElement.className = 'material-image';
    imgElement.dataset.materialName = materialName;
    imgElement.dataset.preference = preference;

    imgElement.addEventListener('click', function() {
        this.classList.toggle('selected');
        // Täällä voit lisätä logiikkaa valintojen tallentamiseen tai käsittelyyn
    });

    return imgElement;
}

document.getElementById('calculateWithPreferences').addEventListener('click', function() {
	const materialInputs = document.querySelectorAll('.my-material input[type="text"]');
    const templateAmountInputs = LEVELS.map(l => document.querySelector(`#templateAmount${l}`));
    let isValid = true;
	let hasValue = false;

	templateAmountInputs.forEach(input => {
		const val = parseInt(input.value.replace(/,/g, ''), 10);
		if (!isNaN(val)) {
				if (val > 0) {
						hasValue = true;
				}
				if (val < 0) {
						isValid = false;
						input.classList.add('missing-input');
						setTimeout(() => {
								input.classList.remove('missing-input');
						}, 3000);
				}
		}
	});

	 if (!hasValue) {
		isValid = false;
		templateAmountInputs.forEach(input => {
				input.classList.add('missing-input');
				setTimeout(() => {
						input.classList.remove('missing-input');
				}, 3000);
		});
	}
	if (!isValid) {
		return; // Estä laskennan suoritus
	}
	
	document.querySelector('.spinner-wrap').classList.add('active');
	
	setTimeout(() => {
		
		let availableMaterials = gatherMaterialsFromInputs();
		if (Object.keys(initialMaterials).length === 0) {
			initialMaterials = { ...availableMaterials };
		}

		let templatesByLevel = {};
		let totalTemplates = 0;
		LEVELS.forEach(level => {
				const val = parseInt(document.getElementById(`templateAmount${level}`).value.replace(/,/g, '')) || 0;
				templatesByLevel[level] = val;
				totalTemplates += val;
				const quality = document.getElementById(`temp${level}`).value;
				qualityMultipliers[level] = getQualityMultiplier(quality);
		});
		if (totalTemplates === 0) {
				document.querySelector('.spinner-wrap').classList.remove('active');
				return;
		} else {
				if (!isDebugMode){
						gtag('event', 'total_material_templates', {
								'event_material_templates': totalTemplates,
								'value': 1
						});
				}
		}
		
		let materialAmounts = Object.values(availableMaterials).map(amount => {
			// Tarkista, onko arvo merkkijono ja sisältääkö se pilkkuja
			if (typeof amount === 'string' && amount.includes(',')) {
				// Muunna merkkijono numeroksi poistamalla pilkut ja käyttämällä parseInt
				return parseInt(amount.replace(/,/g, ''), 10);
			} else {
				// Jos arvo on jo numero tai merkkijono ilman pilkkuja, palauta se sellaisenaan
				return parseInt(amount, 10);
			}
		});
		
		if (!isDebugMode){
			let totalMaterialAmount = materialAmounts.reduce((total, amount) => total + amount, 0);
			let averageMaterialAmount = materialAmounts.length > 0 ? totalMaterialAmount / materialAmounts.length : 0;
			let maxMaterialAmount = Math.max(...materialAmounts);
			let maxMaterialIndex = materialAmounts.findIndex(amount => amount === maxMaterialAmount);
			let maxMaterialName = Object.keys(availableMaterials)[maxMaterialIndex];

			gtag('event', 'material_analytics', {
				'average_material_amount': parseInt(averageMaterialAmount),
				'max_material_amount': maxMaterialAmount,
				'max_material_name': maxMaterialName,
				'value': 1
			});
		}

		let productionPlan = calculateProductionPlan(availableMaterials, templatesByLevel);

		document.querySelectorAll('#manualInput input[type="number"]').forEach(input => {
			input.value = ''; // Nollaa kaikki input-kentät
		});
		listSelectedProducts(productionPlan);
		const calculateBtn = document.querySelector('.calculate-button');
		if (calculateBtn) {
			calculateBtn.click(); // Simuloi napin klikkausta
		}
	}, 0);
});

function gatherMaterialsFromInputs() {
    let materialsInput = {};
    document.querySelectorAll('.my-material input[type="text"]').forEach(input => {
        const id = input.getAttribute('id').replace('my-', '');
        const materialName = Object.keys(allMaterials).find(name => name.toLowerCase().replace(/\s/g, '-') === id);
        const materialAmount = parseInt(input.value.replace(/,/g, ''), 10);
        if (!materialName) {
            return;
        }
        if (!isNaN(materialAmount)) {
            materialsInput[materialName] = materialAmount;
        }
    });

    return materialsInput;
}



function calculateProductionPlan(availableMaterials, templatesByLevel) {
    let productionPlan = { "1": [], "5": [], "10": [], "15": [], "20": [], "25": [] };
    const includeWarlords = document.getElementById('includeWarlords')?.checked ?? true;
    const level1OnlyWarlords = document.getElementById('level1OnlyWarlords')?.checked ?? false;
	const includeLowOdds = document.getElementById('includeLowOdds')?.checked ?? true;
    const includeMediumOdds = document.getElementById('includeMediumOdds')?.checked ?? true;
	
    let remaining = { ...templatesByLevel };

    while (Object.values(remaining).some(v => v > 0)) {
        let preferences = getUserPreferences(availableMaterials);
         let productsSelectedThisRound = {};

        for (let level of LEVELS) {
            if (remaining[level] <= 0) continue;
            let levelProducts;
            if (level === 1 && level1OnlyWarlords) {
                levelProducts = craftItem.products.filter(product => product.level === 1 && product.warlord);
            } else {
                levelProducts = craftItem.products.filter(product => product.level === level && (includeWarlords || !product.warlord));
            }
			
			levelProducts = levelProducts.filter(product => {
                if (product.season !== 0 || !product.odds) return true;
                if (product.odds === 'low') return includeLowOdds;
                if (product.odds === 'medium') return includeMediumOdds;
                return true; // normal odds
            });
			
			
            const multiplier = qualityMultipliers[level] || 1;
            const selectedProduct = selectBestAvailableProduct(levelProducts, preferences.mostAvailableMaterials, preferences.secondMostAvailableMaterials, preferences.leastAvailableMaterials, availableMaterials, multiplier);
    

            if (selectedProduct && canProductBeProduced(selectedProduct, availableMaterials, multiplier)) {
                productionPlan[level].push(selectedProduct.name);
                productsSelectedThisRound[level] = selectedProduct; // Tallennetaan valittu tuote
                updateAvailableMaterials(availableMaterials, selectedProduct, multiplier); // Päivitetään materiaalien määrä
				remaining[level]--; 
            } else {
                // Jos tuotetta ei voi valita, keskeytetään prosessi ja poistetaan edelliset tuotteet
                LEVELS.forEach(l => {
                    if (productsSelectedThisRound[l]) {
                        rollbackMaterials(availableMaterials, productsSelectedThisRound[l], qualityMultipliers[l] || 1);
                        productionPlan[l].pop();
                        if (remaining[l] >= 0) {
                            remaining[l]++;
                        }
                    }
                });

                return productionPlan; // Palautetaan jo tuotettu tuotantosuunnitelma
            }
        }
    }
    return productionPlan; // Kaikki pyydetyt templatet onnistuttiin tuottamaan
}

function displayUserMessage(message) {
    const resultsDiv = document.getElementById('results');
    const messageElement = document.createElement('h3');
    messageElement.innerHTML = message;
    const generateDiv = resultsDiv.querySelector('.generate');

    // Lisää viesti ennen generateDiviä
    resultsDiv.insertBefore(messageElement, generateDiv);
}




function updateAvailableMaterials(availableMaterials, selectedProduct, multiplier = 1) {
    Object.entries(selectedProduct.materials).forEach(([material, amountRequired]) => {
        const normalizedMaterial = material.toLowerCase().replace(/\s/g, '-');
        const matchedKey = Object.keys(availableMaterials).find(key =>
            key.toLowerCase().replace(/\s/g, '-') === normalizedMaterial
        );

        if (matchedKey) {
            availableMaterials[matchedKey] -= amountRequired * multiplier;
        }
    });
}







function getUserPreferences(availableMaterials) {
	let sortedMaterials = Object.entries(availableMaterials).sort((a, b) => b[1] - a[1]);
    let uniqueAmounts = [...new Set(sortedMaterials.map(([_, amount]) => amount))];

    let mostAvailableMaterials = [], secondMostAvailableMaterials = [], leastAvailableMaterials = [];

    // Määritä materiaalit, joita on eniten
    let maxAmount = uniqueAmounts[0];
    mostAvailableMaterials = sortedMaterials.filter(([_, amount]) => amount === maxAmount).map(([material, _]) => material);

    if (mostAvailableMaterials.length < 4) {
        let nextAmountIndex = 1;
        while (secondMostAvailableMaterials.length < 4 - mostAvailableMaterials.length && nextAmountIndex < uniqueAmounts.length) {
            let currentAmount = uniqueAmounts[nextAmountIndex];
            let currentMaterials = sortedMaterials.filter(([_, amount]) => amount === currentAmount).map(([material, _]) => material);
            secondMostAvailableMaterials.push(...currentMaterials);
            nextAmountIndex++;
        }
        secondMostAvailableMaterials = secondMostAvailableMaterials.slice(0, 4 - mostAvailableMaterials.length);
    }

    // Määritä materiaalit, joita on vähiten, huomioiden most ja second
    if (mostAvailableMaterials.length + secondMostAvailableMaterials.length < 12) {
        let leastAmountsNeeded = 4;
        if (mostAvailableMaterials.length + secondMostAvailableMaterials.length > 8) {
            leastAmountsNeeded = 12 - (mostAvailableMaterials.length + secondMostAvailableMaterials.length);
        }

        let leastIndexStart = uniqueAmounts.length - leastAmountsNeeded;
        for (let i = leastIndexStart; i < uniqueAmounts.length; i++) {
            let currentAmount = uniqueAmounts[i];
            leastAvailableMaterials.push(...sortedMaterials.filter(([_, amount]) => amount === currentAmount).map(([material, _]) => material));
        }
        leastAvailableMaterials = leastAvailableMaterials.slice(0, leastAmountsNeeded);
    }

    return { mostAvailableMaterials, secondMostAvailableMaterials, leastAvailableMaterials };
}

function selectBestAvailableProduct(levelProducts, mostAvailableMaterials, secondMostAvailableMaterials, leastAvailableMaterials, availableMaterials, multiplier = 1) {
    // Järjestä tuotteet pisteiden mukaan
    const candidates = levelProducts
        .map(product => ({
            product,
			score: getMaterialScore(product, mostAvailableMaterials, secondMostAvailableMaterials, leastAvailableMaterials, availableMaterials, multiplier)
        }))
        .sort((a, b) => b.score - a.score); // suurimmasta pienimpään

    // Etsi ensimmäinen tuote, jonka materiaalit riittävät
    for (const { product } of candidates) {
        if (canProductBeProduced(product, availableMaterials, multiplier)) {
            return product;
        }
    }

    return null; // Mikään tuote ei kelpaa
}

function rollbackMaterials(availableMaterials, product, multiplier = 1) {

    Object.entries(product.materials).forEach(([material, amountRequired]) => {
        const normalizedMaterial = material.toLowerCase().replace(/\s/g, '-');
        const matchedKey = Object.keys(availableMaterials).find(key =>
            key.toLowerCase().replace(/\s/g, '-') === normalizedMaterial
        );

        if (matchedKey) {
            availableMaterials[matchedKey] += amountRequired * multiplier;
        }
    });
}


function getMaterialScore(product, mostAvailableMaterials, secondMostAvailableMaterials, leastAvailableMaterials, availableMaterials, multiplier = 1) {
    let score = 0;
    Object.entries(product.materials).forEach(([material, _]) => {
        if (mostAvailableMaterials.includes(material)) {
            score += 10;
        }
        if (secondMostAvailableMaterials.includes(material)) {
            score += 5;
        }
        if (leastAvailableMaterials.includes(material)) {
            score -= 10;
        }
    });
	    if (product.warlord) {
        score -= WARLORD_PENALTY;
    }

    Object.entries(product.materials).forEach(([material, amount]) => {
        const normalizedMaterial = material.toLowerCase().replace(/\s/g, '-');
        const matchedKey = Object.keys(availableMaterials).find(key =>
            key.toLowerCase().replace(/\s/g, '-') === normalizedMaterial
        );
        if (matchedKey) {
            const available = availableMaterials[matchedKey];
            const remaining = available - amount * multiplier;
            if (available > 0) {
                score -= (remaining / available) * LEFTOVER_WEIGHT;
            }
        }
    });
	
    return score;
}

function canProductBeProduced(product, availableMaterials, multiplier = 1) {
    return Object.entries(product.materials).every(([material, amountRequired]) => {
        const normalizedMaterial = material.toLowerCase().replace(/\s/g, '-');
        const matchedKey = Object.keys(availableMaterials).find(key =>
            key.toLowerCase().replace(/\s/g, '-') === normalizedMaterial
        );

        if (!matchedKey) {
            return false;
        }

        return availableMaterials[matchedKey] >= amountRequired * multiplier;
    });
}





function listSelectedProducts(productionPlan) {
    Object.entries(productionPlan).forEach(([level, productNames]) => {
        productNames.forEach(productName => {
            // Etsi olemassa oleva input-kenttä tuotenimen perusteella
            const inputElement = document.querySelector(`#level-${level}-items input[name="${productName}"]`);
            if (inputElement) {
                // Päivitä input-kentän arvo valittujen tuotteiden määrällä
                inputElement.value = (parseInt(inputElement.value) || 0) + 1;
            }
        });
    });
}


function inputActive(){

	document.addEventListener('click', (e) => {
        const clickedDiv = e.target.closest('.my-material');
        if (clickedDiv && !e.target.closest('.level-checkboxes')) {
            document.querySelectorAll('.my-material').forEach(div => {
                const inp = div.querySelector('.numeric-input');
                if (div !== clickedDiv && inp && inp.value === '') {
                    div.classList.remove('active');
                }
            });
            clickedDiv.classList.add('active');
            const input = clickedDiv.querySelector('.numeric-input');
            if (input) input.focus();
        }
    });

	document.addEventListener('focusout', (e) => {
        if (e.target.classList.contains('numeric-input')) {
            if (e.target.value === '') {
                const parent = e.target.closest('.my-material');
                if (parent) parent.classList.remove('active');
            }
        }
    }, true);
	
	document.addEventListener('focusin', (e) => {
        if (e.target.classList.contains('numeric-input')) {
            document.querySelectorAll('.my-material').forEach(div => {
                const inp = div.querySelector('.numeric-input');
                if (inp && inp.value === '' && div !== e.target.closest('.my-material')) {
                    div.classList.remove('active');
                }
            });
            e.target.closest('.my-material').classList.add('active');
        }
    });		

	// Uusi osa: käsittele kaikki templateAmount-inputit tasoittain (1,5,10,...)
	const levels = [1, 5, 10, 15, 20, 25];
	levels.forEach(level => {
		const input = document.querySelector(`#templateAmount${level}`);
		const wrap = document.querySelector(`.leveltmp${level} .templateAmountWrap`);

		if (input && wrap) {
			input.addEventListener('focus', () => {
				wrap.classList.add('active');
			});

			input.addEventListener('blur', () => {
				if (!input.value) {
					wrap.classList.remove('active');
				}
			});
		}
	});
}

function initAdvMaterialSection() {
    const toggle = document.getElementById('toggleAdvMaterials');
    const container = document.getElementById('advMaterials');
    if (!toggle || !container || typeof seasons === 'undefined') return;

    toggle.addEventListener('click', () => {
        container.style.display = container.style.display === 'none' ? 'block' : 'none';
    });

    const seasonData = seasons.filter(s => s.season !== 0).sort((a, b) => b.season - a.season);

    seasonData.forEach(season => {
        const header = document.createElement('h4');
        header.textContent = `Season ${season.season}`;
        container.appendChild(header);

        const seasonDiv = document.createElement('div');
        seasonDiv.style.display = 'none';
        container.appendChild(seasonDiv);

        header.addEventListener('click', () => {
            seasonDiv.style.display = seasonDiv.style.display === 'none' ? 'block' : 'none';
        });

        season.sets.forEach(set => {
            const matKey = set.setMat.toLowerCase().replace(/\s/g, '-');
            const matInfo = materials[season.season] && materials[season.season].mats[matKey];
            if (!matInfo) return;

            const matDiv = document.createElement('div');
            matDiv.className = `my-material ${matKey}`;

            const img = document.createElement('img');
            img.src = matInfo.img;
            matDiv.appendChild(img);

            const inner = document.createElement('div');
            const span = document.createElement('span');
            span.textContent = matInfo["Original-name"] || set.setMat;
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'numeric-input';
            input.id = `my-${matKey}`;
            input.name = `my-${matKey}`;
            input.placeholder = 'value';
            input.pattern = '[0-9]*';
            input.inputMode = 'numeric';
            inner.appendChild(span);
            inner.appendChild(input);
            matDiv.appendChild(inner);

            seasonDiv.appendChild(matDiv);
        });
    });

    const levelWrap = document.createElement('div');
    levelWrap.className = 'level-select-container';
    const levelLabel = document.createElement('p');
    levelLabel.textContent = 'Allow gear material usage at levels';
    levelWrap.appendChild(levelLabel);

    const dropdown = document.createElement('div');
    dropdown.className = 'level-dropdown';
    const select = document.createElement('select');
    select.id = 'gearMaterialLevels';
    select.multiple = true;
    select.style.display = 'none';

    [5,10,15,20,25].forEach(l => {
        const optionDiv = document.createElement('div');
        optionDiv.dataset.value = l;
        optionDiv.textContent = l;
        if (![5,10].includes(l)) {
            optionDiv.classList.add('selected');
        }
        dropdown.appendChild(optionDiv);

        const opt = document.createElement('option');
        opt.value = l;
        opt.textContent = l;
        if (![5,10].includes(l)) {
            opt.selected = true;
        }
        select.appendChild(opt);
    });

    dropdown.addEventListener('click', e => {
        const value = e.target.dataset.value;
        if (!value) return;
        e.target.classList.toggle('selected');
        Array.from(select.options).forEach(opt => {
            if (opt.value === value) {
                opt.selected = !opt.selected;
            }
        });
    });

    levelWrap.appendChild(dropdown);
    levelWrap.appendChild(select);
    container.appendChild(levelWrap);
}
