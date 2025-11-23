// --- Constantes de Local Storage ---
const LS_KEY = 've_payment_calculator_state';

// --- Estado Global ---
const state = {
	bcv: 0,
	usdt: 0, 
	avgRate: 0,
	manualOverrideAvg: false, 
	
	// Solo persistimos los USD (Oferta) que son los inputs primarios
	price_bcv_usd: 0, 
	price_avg_usd: 0, 
};

// Elementos del DOM
const els = {
	section1: document.getElementById('section1'),
	section2: document.getElementById('section2'),
	
	bcvDisplay: document.getElementById('bcvDisplay'),
	usdtDisplay: document.getElementById('usdtDisplay'),
	bcvLoader: document.getElementById('bcvLoader'),
	usdtLoader: document.getElementById('usdtLoader'),
	rateDiff: document.getElementById('rateDiff'),
	avgRateInput: document.getElementById('avgRateInput'),
	
	price_bcv_usd_input: document.getElementById('price_bcv_usd_input'),
	price_bcv_ves_input: document.getElementById('price_bcv_ves_input'),
	price_avg_usd_input: document.getElementById('price_avg_usd_input'),
	price_avg_ves_input: document.getElementById('price_avg_ves_input'),
	
	recommendationBox: document.getElementById('recommendationBox'),
	finalVerdict: document.getElementById('finalVerdict'),
	savingsText: document.getElementById('savingsText'),

	usdtResultCard: document.getElementById('usdtResultCard'), // ID para el card de USDT
	usdtTransferCost: document.getElementById('usdtTransferCost'),
	usdtSubtitle: document.getElementById('usdtSubtitle'), // Nuevo: Subtítulo de USDT
	
	btnCalculate: document.getElementById('btnCalculate'),
	btnEdit: document.getElementById('btnEdit'), 
	btnReset: document.getElementById('btnReset')
};

// --- Lógica de Persistencia Local (LocalStorage) ---

// Guarda el estado actual en localStorage
let saveTimeout;
const DEBOUNCE_TIME = 800;

function saveState() {
	clearTimeout(saveTimeout);
	saveTimeout = setTimeout(() => {
		const dataToSave = {
			bcv: parseFloat(els.bcvDisplay.value) || 0,
			usdt: parseFloat(els.usdtDisplay.value) || 0,
			avgRate: parseFloat(els.avgRateInput.value) || 0,
			price_bcv_usd: parseFloat(els.price_bcv_usd_input.value) || 0, 
			price_avg_usd: parseFloat(els.price_avg_usd_input.value) || 0, 
			manualOverrideAvg: state.manualOverrideAvg
		};
		try {
			localStorage.setItem(LS_KEY, JSON.stringify(dataToSave));
		} catch (e) {
			console.error("Error al guardar en LocalStorage:", e);
		}
	}, DEBOUNCE_TIME);
}

// Carga el estado desde localStorage y lo aplica
function loadSavedState() {
	let dataLoaded = false;
	try {
		const savedData = localStorage.getItem(LS_KEY);
		if (savedData) {
			const data = JSON.parse(savedData);
			
			state.manualOverrideAvg = data.manualOverrideAvg === true;
			
			els.bcvDisplay.value = (data.bcv || 0).toFixed(2);
			els.usdtDisplay.value = (data.usdt || 0).toFixed(2);
			els.avgRateInput.value = (data.avgRate || 0).toFixed(2); 

			// Cargar Precios (Solo los USD editables)
			els.price_bcv_usd_input.value = (data.price_bcv_usd > 0) ? data.price_bcv_usd.toFixed(2) : '';
			els.price_avg_usd_input.value = (data.price_avg_usd > 0) ? data.price_avg_usd.toFixed(2) : '';
			
			dataLoaded = true;
		}
	} catch (e) {
		console.error("Error al cargar desde LocalStorage:", e);
	}
	updateDiff();
	recalculateAvg(true); 
	updateConversions(); 
	return dataLoaded;
}

// --- Funciones de API y UI ---

async function fetchWithRetry(url, options = {}, retries = 3) {
	let delay = 1000;
	for (let i = 0; i < retries; i++) {
		try {
			const response = await fetch(url, options);
			if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
			return await response.json();
		} catch (error) {
			if (i === retries - 1) {
				console.error("Error final en fetch:", error);
				throw error;
			}
			await new Promise(resolve => setTimeout(resolve, delay));
			delay *= 2;
		}
	}
}

async function fetchRates(isReset = false) {
	showLoaders(true);
	
	let bcvVal = parseFloat(els.bcvDisplay.value) || 0; 
	let usdtVal = parseFloat(els.usdtDisplay.value) || 0; 

	const apiUrl = 'https://ve.dolarapi.com/v1/dolares'; 

	try {
		const data = await fetchWithRetry(apiUrl);
		
		const oficialRate = data.find(item => item.fuente === 'oficial');
		const paraleloRate = data.find(item => item.fuente === 'paralelo');

		if (oficialRate && oficialRate.promedio) {
			bcvVal = parseFloat(oficialRate.promedio);
		}
		
		if (paraleloRate && paraleloRate.promedio) {
			usdtVal = parseFloat(paraleloRate.promedio);
		}
	} catch (error) {
		console.error("Error obteniendo tasas del API. Usando valores guardados localmente o de fallback.", error);
	} finally {
		state.bcv = bcvVal;
		state.usdt = usdtVal;
		
		els.bcvDisplay.value = state.bcv.toFixed(2);
		els.usdtDisplay.value = state.usdt.toFixed(2);
		
		showLoaders(false);
		updateDiff();
		
		// Si es un reinicio, forzamos el recálculo del promedio
		if (isReset) {
			state.manualOverrideAvg = false;
		}
		recalculateAvg();
		updateConversions(); 
		saveState(); // Guardar las tasas finales
	}
}

function showLoaders(show) {
	const opacity = show ? '1' : '0';
	els.bcvLoader.style.opacity = opacity;
	els.usdtLoader.style.opacity = opacity;
}

function updateDiff() {
	const bcv = parseFloat(els.bcvDisplay.value) || 0;
	const usdt = parseFloat(els.usdtDisplay.value) || 0;
	
	const diff = usdt - bcv;
	const diffPerc = bcv > 0 ? (diff / bcv) * 100 : 0;
	
	let colorClass = 'text-slate-500';
	if (diffPerc > 5) {
		colorClass = 'text-red-400';
	} else if (diffPerc > 1) {
		colorClass = 'text-orange-400';
	} else {
		colorClass = 'text-green-400';
	}
	
	els.rateDiff.innerHTML = `
		<span class="${colorClass} font-bold">${diff.toFixed(2)} Bs</span> 
		<span class="text-slate-500">(</span>
		<span class="${colorClass} font-bold">${diffPerc.toFixed(2)}%</span>
		<span class="text-slate-500">)</span>
	`;
}

// --- Lógica de Cálculo y Conversión ---

function recalculateAvg(forceRecalculate = false) {
	// Solo calcular si no hay un override manual, a menos que se fuerce.
	if (state.manualOverrideAvg && !forceRecalculate) {
		return; 
	}

	const currentBcv = parseFloat(els.bcvDisplay.value) || 0;
	const currentUsdt = parseFloat(els.usdtDisplay.value) || 0;

	// FÓRMULA: ((BCV + P2P) / 2) * 1.10
	const simpleAvg = (currentBcv + currentUsdt) / 2;
	const rawAvg = simpleAvg * 1.10; // + 10%
	
	state.avgRate = Math.round((rawAvg + Number.EPSILON) * 100) / 100;
	
	els.avgRateInput.value = state.avgRate.toFixed(2);
	updateConversions(null, true); 
}

function updateConversions(trigger = null, skipSave = false) {
	const currentBcvRate = parseFloat(els.bcvDisplay.value);
	const currentAvgRate = parseFloat(els.avgRateInput.value);

	if (isNaN(currentBcvRate) || currentBcvRate <= 0 || isNaN(currentAvgRate) || currentAvgRate <= 0) {
		 // No analizamos si las tasas no son válidas, pero podemos forzar el guardado si es necesario
		 if (!skipSave) saveState();
		 return;
	}
	
	let val;
	
	// Opción 1 (BCV): USD (Editable) -> VES (Calculado)
	val = parseFloat(els.price_bcv_usd_input.value) || 0;
	els.price_bcv_ves_input.value = val > 0 ? (val * currentBcvRate).toFixed(2) : '';

	// Opción 2 (Promedio): USD (Editable) -> VES (Calculado)
	val = parseFloat(els.price_avg_usd_input.value) || 0;
	els.price_avg_ves_input.value = val > 0 ? (val * currentAvgRate).toFixed(2) : '';
	
	if (!skipSave) {
		saveState();
	}
	// NOTA: analyzePayment solo se llama con el botón "Calcular" ahora.
}


function analyzePayment() {
	const optionBcv_Ves = parseFloat(els.price_bcv_ves_input.value);
	const optionAvg_Ves = parseFloat(els.price_avg_ves_input.value);
	const currentUsdtRate = parseFloat(els.usdtDisplay.value); // Tasa P2P/Binance
	
	// Validar que ambos campos de USD tengan valores > 0 antes de mostrar resultados
	if (isNaN(optionBcv_Ves) || isNaN(optionAvg_Ves) || optionBcv_Ves === 0 || optionAvg_Ves === 0 || isNaN(currentUsdtRate) || currentUsdtRate <= 0) {
		// Ocultar resultados y mostrar inputs
		els.section1.classList.remove('hidden');
		els.section2.classList.add('hidden'); 
		
		// Usar una alerta simple en consola si la validación falla
		console.warn("Por favor, ingrese un valor de precio en Dólares ($) en ambas opciones y asegúrese de que las tasas estén cargadas.");
		return;
	}

	// Ocultar Sección 1 (Inputs) y mostrar Sección 2 (Resultados)
	els.section1.classList.add('hidden');
	els.section2.classList.remove('hidden');

	// 1. Determinar el costo mínimo en Bolívares
	const min_ves_cost = Math.min(optionBcv_Ves, optionAvg_Ves);

	// 2. Calcular el costo equivalente en USDT (El card de USDT siempre es amarillo)
	const usdtEquivalentCost = min_ves_cost / currentUsdtRate;
	
	// Formatear el costo para el texto del subtítulo
	const usdtFormatted = usdtEquivalentCost.toFixed(2); 
	
	// Actualizar el monto grande (ya es amarillo por CSS)
	els.usdtTransferCost.textContent = `$ ${usdtFormatted}`;
	
	// Crear el nuevo subtítulo con el valor resaltado (Cambiado según la petición)
	const newSubtitle = `
		Si piensas pagar en USDT, El monto indicado es el calculo más bajo en Bolívares. 
		Por lo tanto, solo debes transferir 
		<span class="text-yellow-300 font-bold">$ ${usdtFormatted}</span> 
		USDT al vendedor.
	`;
	els.usdtSubtitle.innerHTML = newSubtitle;
	
	// Asegurar que el card USDT es amarillo
	els.usdtResultCard.classList.remove('border-blue-500/50'); 
	els.usdtResultCard.classList.add('border-yellow-500/50');


	// 3. Lógica de recomendación de pago
	const box = els.recommendationBox;
	const verdict = els.finalVerdict;
	const savings = els.savingsText;

	// Resetear clases
	box.className = 'card p-4 bg-slate-800/50 border-t-4 transition-all duration-300';
	verdict.classList.remove('text-green-400', 'text-blue-400', 'animate-pulse', 'text-white', 'text-yellow-400');
	
	const diffVes = Math.abs(optionBcv_Ves - optionAvg_Ves);
	const maxVes = Math.max(optionBcv_Ves, optionAvg_Ves);
	const diffPerc = (maxVes > 0) ? (diffVes / maxVes) * 100 : 0;
	
	const vesFormat = (val) => val.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' Bs';
	const percFormat = (val) => val.toFixed(2); 
	
	const currentRate = (optionBcv_Ves < optionAvg_Ves) ? parseFloat(els.bcvDisplay.value) : parseFloat(els.avgRateInput.value);
	let usdEquivalent = currentRate > 0 ? diffVes / currentRate : 0;

	if (optionBcv_Ves < optionAvg_Ves) {
		// Gana BCV (Bolívares) - AHORA AZUL
		const color = 'text-blue-400';
		box.classList.add('border-blue-500', 'bg-blue-900/20'); 
		
		verdict.textContent = "Bolívares (Tasa Oficial)"; 
		verdict.classList.add('text-blue-400');
		
		savings.innerHTML = `
			**El costo es menor usando la tasa oficial**
			<span class="text-xs block mt-1">
				Ahorro Total: 
				<span class="text-blue-300">${vesFormat(diffVes)}</span>
				<br/>
				<span class="text-slate-300 font-bold">(</span><span class="${color} font-bold">$ ${usdEquivalent.toFixed(2)}</span><span class="text-slate-300 font-bold">)</span>
				<span class="text-slate-300 font-bold">→</span> 
				<span class="${color} text-xs"> ${percFormat(diffPerc)}% menos</span>.
			</span>
			 <span class="text-[10px] block mt-1">
				(Costo Bolívares: ${vesFormat(optionBcv_Ves)} | Costo Dólares: ${vesFormat(optionAvg_Ves)})
			</span>
		`;
	} else if (optionAvg_Ves < optionBcv_Ves) {
		// Gana Promedio (Dólares Físicos) - AHORA VERDE
		const color = 'text-green-400';
		box.classList.add('border-green-500', 'bg-green-900/20'); 
		
		verdict.textContent = "Dólares (Tasa Promedio)";
		verdict.classList.add('text-green-400');

		savings.innerHTML = `
			**El costo es menor usando la tasa promedio**
			<span class="text-xs block mt-1">
				Ahorro Total: 
				<span class="text-green-300">${vesFormat(diffVes)}</span>
				<br/>
				<span class="text-slate-300 font-bold">(</span><span class="${color} font-bold">$ ${usdEquivalent.toFixed(2)}</span><span class="text-slate-300 font-bold">)</span>
				<span class="text-slate-300 font-bold">→</span>
				<span class="${color} text-xs"> ${percFormat(diffPerc)}% menos</span>.
			</span>
			 <span class="text-[10px] block mt-1">
				(Costo Bolívares: ${vesFormat(optionBcv_Ves)} | Costo Dólares: ${vesFormat(optionAvg_Ves)})
			</span>
		`;
	} else {
		// Precios iguales
		box.classList.add('border-slate-600');
		verdict.textContent = "Indistinto";
		verdict.classList.add('text-white');
		savings.textContent = `La diferencia es menor a 0.01 Bs, ambas opciones son igualmente convenientes.`;
	}
}

// --- Control de Navegación ---

function showInputs() {
	els.section1.classList.remove('hidden');
	els.section2.classList.add('hidden');
	// Forzar recálculo al volver, por si las tasas cambiaron al estar en resultados
	updateDiff();
	recalculateAvg(true); 
	updateConversions();
}

function handleResetValues() {
	// 1. Resetear inputs de precio
	els.price_bcv_usd_input.value = '';
	els.price_bcv_ves_input.value = '';
	els.price_avg_usd_input.value = '';
	els.price_avg_ves_input.value = '';
	
	// 2. Resetear estado de override manual y fetch rates (que también actualiza tasas y promedio)
	state.manualOverrideAvg = false;
	fetchRates(true); // Pasar true para forzar el recálculo del promedio
	
	// 3. Mostrar inputs y ocultar resultados
	showInputs();
}

// --- Event Listeners ---

const handleRateChange = () => { updateDiff(); recalculateAvg(); updateConversions(); saveState(); };
const handleOfferUsdChange = () => { updateConversions(); };

['input', 'keyup'].forEach(evt => {
	els.bcvDisplay.addEventListener(evt, handleRateChange);
	els.usdtDisplay.addEventListener(evt, handleRateChange);
	els.price_bcv_usd_input.addEventListener(evt, handleOfferUsdChange);
	els.price_avg_usd_input.addEventListener(evt, handleOfferUsdChange);
});

els.avgRateInput.addEventListener('input', (e) => {
	state.manualOverrideAvg = true; 
	state.avgRate = parseFloat(e.target.value);
	updateConversions(); 
	saveState();
});

// Botones de control de flujo
els.btnCalculate.addEventListener('click', analyzePayment);
els.btnEdit.addEventListener('click', showInputs); // Usamos showInputs
els.btnReset.addEventListener('click', handleResetValues); // Usamos handleResetValues


document.addEventListener('DOMContentLoaded', () => {
	loadSavedState(); 
	// Si hay precios cargados al inicio, mostramos inputs (para que el usuario presione calcular)
	if (parseFloat(els.price_bcv_usd_input.value) > 0 || parseFloat(els.price_avg_usd_input.value) > 0) {
		 showInputs();
	} else {
		 els.section2.classList.add('hidden');
	}
	fetchRates();
});
