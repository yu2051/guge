document.addEventListener('DOMContentLoaded', () => {
    // --- UI Elements ---
    const authCheckingUI = document.getElementById('auth-checking');
    const unauthorizedUI = document.getElementById('unauthorized');
    const mainContentUI = document.getElementById('main-content');

    // --- Global State & Elements ---
    const loadingIndicator = document.getElementById('loading-indicator');
    const errorMessageDiv = document.getElementById('error-message');
    const errorTextSpan = document.getElementById('error-text');
    const successMessageDiv = document.getElementById('success-message');
    const successTextSpan = document.getElementById('success-text');
    const geminiKeysListDiv = document.getElementById('gemini-keys-list');
    const addGeminiKeyForm = document.getElementById('add-gemini-key-form');
    const workerKeysListDiv = document.getElementById('worker-keys-list');
    const addWorkerKeyForm = document.getElementById('add-worker-key-form');
    const generateWorkerKeyBtn = document.getElementById('generate-worker-key');
    const workerKeyValueInput = document.getElementById('worker-key-value');
    const modelsListDiv = document.getElementById('models-list');
    const addModelForm = document.getElementById('add-model-form');
    const modelCategorySelect = document.getElementById('model-category');
    const customQuotaDiv = document.getElementById('custom-quota-div');
    const modelQuotaInput = document.getElementById('model-quota');
    const modelIdInput = document.getElementById('model-id');
    const setCategoryQuotasBtn = document.getElementById('set-category-quotas-btn');
    const categoryQuotasModal = document.getElementById('category-quotas-modal');
    const closeCategoryQuotasModalBtn = document.getElementById('close-category-quotas-modal');
    const cancelCategoryQuotasBtn = document.getElementById('cancel-category-quotas');
    const categoryQuotasForm = document.getElementById('category-quotas-form');
    const proQuotaInput = document.getElementById('pro-quota');
    const flashQuotaInput = document.getElementById('flash-quota');
    const categoryQuotasErrorDiv = document.getElementById('category-quotas-error');
    const geminiKeyErrorContainer = document.getElementById('gemini-key-error-container'); // Container for error messages in modal
    // Individual Quota Elements
    const individualQuotaModal = document.getElementById('individual-quota-modal');
    const closeIndividualQuotaModalBtn = document.getElementById('close-individual-quota-modal');
    const cancelIndividualQuotaBtn = document.getElementById('cancel-individual-quota');
    const individualQuotaForm = document.getElementById('individual-quota-form');
    const individualQuotaModelIdInput = document.getElementById('individual-quota-model-id');
    const individualQuotaValueInput = document.getElementById('individual-quota-value');
    const individualQuotaErrorDiv = document.getElementById('individual-quota-error');
    const logoutButton = document.getElementById('logout-button');
    const darkModeToggle = document.getElementById('dark-mode-toggle');
    const sunIcon = document.getElementById('sun-icon');
    const moonIcon = document.getElementById('moon-icon');
    // Run All Test Elements
    const runAllTestBtn = document.getElementById('run-all-test-btn');
    const testProgressArea = document.getElementById('test-progress-area');
    const cancelAllTestBtn = document.getElementById('cancel-all-test-btn');
    const testProgressBar = document.getElementById('test-progress-bar');
    const testProgressText = document.getElementById('test-progress-text');
    const testStatusText = document.getElementById('test-status-text');

    // --- Global Cache ---
    let cachedModels = [];
    let cachedGeminiModels = []; // Add cache for available Gemini models
    let cachedCategoryQuotas = { proQuota: 0, flashQuota: 0 };

    // --- Global Test State ---
    let isRunningAllTests = false;
    let testCancelRequested = false;
    let currentTestBatch = [];
    // No need for a separate errorKeyIds cache, as errorStatus is now part of the key data

    // --- Run All Test Functions ---
    async function runAllGeminiKeysTest() {
        try {
            isRunningAllTests = true;
            testCancelRequested = false;

            // Show progress area
            testProgressArea.classList.remove('hidden');
            runAllTestBtn.disabled = true;
            cancelAllTestBtn.disabled = false;

            // Get all Gemini keys
            const keys = await apiFetch('/gemini-keys');
            if (!keys || keys.length === 0) {
                showError(t('no_gemini_keys_found'));
                return;
            }

            const totalKeys = keys.length;
            let completedTests = 0;
            const testModel = 'gemini-2.0-flash'; // Fixed model for testing

            // Update initial progress
            updateTestProgress(completedTests, totalKeys, t('preparing_tests'));

            // Process keys in batches of 5
            const batchSize = 5;
            for (let i = 0; i < keys.length; i += batchSize) {
                if (testCancelRequested) {
                    break;
                }

                const batch = keys.slice(i, i + batchSize);
                currentTestBatch = batch;

                updateTestProgress(completedTests, totalKeys, t('testing_batch', Math.floor(i / batchSize) + 1));

                // Run tests for current batch concurrently
                const batchPromises = batch.map(key => testSingleKey(key.id, testModel));
                const batchResults = await Promise.allSettled(batchPromises);

                // Update progress
                completedTests += batch.length;
                updateTestProgress(completedTests, totalKeys, t('completed_tests', completedTests, totalKeys));

                // Small delay between batches to avoid overwhelming the server
                if (i + batchSize < keys.length && !testCancelRequested) {
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }

            // Final status
            if (testCancelRequested) {
                updateTestProgress(completedTests, totalKeys, t('tests_cancelled'));
                showError(t('test_run_cancelled'));
            } else {
                updateTestProgress(completedTests, totalKeys, t('all_tests_completed'));
                showSuccess(t('completed_testing', totalKeys, testModel));

                // Auto-hide progress area after 3 seconds
                setTimeout(() => {
                    testProgressArea.classList.add('hidden');
                }, 3000);
            }

            // Reload keys to show updated status
            await loadGeminiKeys();

        } catch (error) {
            console.error('Error running all tests:', error);
            showError(t('failed_to_run_tests', error.message));
            updateTestProgress(0, 0, t('test_run_failed'));
        } finally {
            isRunningAllTests = false;
            runAllTestBtn.disabled = false;
            cancelAllTestBtn.disabled = true;
            currentTestBatch = [];
        }
    }

    async function testSingleKey(keyId, modelId) {
        try {
            // Use direct fetch to get detailed error information
            const response = await fetch('/api/admin/test-gemini-key', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({ keyId, modelId })
            });

            // Parse response regardless of status code
            let result = null;
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.indexOf("application/json") !== -1) {
                result = await response.json();
            } else {
                const textContent = await response.text();
                result = {
                    success: false,
                    status: response.status,
                    content: textContent || 'No response content'
                };
            }

            return {
                keyId,
                success: result?.success || false,
                status: result?.status || response.status,
                error: result?.success ? null : (result?.content || 'Test failed')
            };
        } catch (error) {
            return {
                keyId,
                success: false,
                status: 'error',
                error: error.message || 'Network error'
            };
        }
    }

    function updateTestProgress(completed, total, statusMessage) {
        const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

        testProgressBar.style.width = `${percentage}%`;
        testProgressText.textContent = `${completed} / ${total}`;
        testStatusText.textContent = statusMessage;
    }

    // --- Utility Functions ---
    function showLoading() {
        loadingIndicator.classList.remove('hidden');
    }

    function hideLoading() {
        loadingIndicator.classList.add('hidden');
    }

    function showError(message, element = errorTextSpan, container = errorMessageDiv) {
        element.textContent = message;
        container.classList.remove('hidden');
        // Auto-hide after 5 seconds
        setTimeout(() => {
            hideError(container);
        }, 5000);
    }

function hideError(container = errorMessageDiv) {
    container.classList.add('hidden');
    const textSpan = container.querySelector('span#error-text'); 
    if (textSpan) textSpan.textContent = ''; // Only clear the message span
}

    // Function to show success message and auto-hide
    function showSuccess(message, element = successTextSpan, container = successMessageDiv) {
        element.textContent = message;
        container.classList.remove('hidden');
        // Auto-hide after 3 seconds
        setTimeout(() => {
            hideSuccess(container);
        }, 3000);
    }

    // Function to hide success message
    function hideSuccess(container = successMessageDiv) {
        container.classList.add('hidden');
        const textSpan = container.querySelector('span');
        if (textSpan) textSpan.textContent = '';
    }

    // Generic API fetch function (using cookie auth now)
    // 新增 suppressGlobalError 参数，允许调用方控制是否全局报错
    async function apiFetch(endpoint, options = {}, suppressGlobalError = false) {
        showLoading();
        hideError();
        hideError(categoryQuotasErrorDiv);
        hideSuccess(); // Hide success message on new request

        // No need for Authorization header, rely on HttpOnly cookie
        const defaultHeaders = {
            'Content-Type': 'application/json',
        };

        try {
            const response = await fetch(`/api/admin${endpoint}`, {
                credentials: 'include', 
                ...options,
                headers: {
                    ...defaultHeaders,
                    ...(options.headers || {}),
                },
            });

            // Check for auth errors (401 Unauthorized, 403 Forbidden)
            if (response.status === 401 || response.status === 403) {
                console.log("Authentication required or session expired. Redirecting to login.");
                localStorage.removeItem('isLoggedIn');
                window.location.href = '/login';
                return null;
            }
            
            // Check for redirects that might indicate auth issues (302, 307, etc.)
            if (response.redirected) {
                const redirectUrl = new URL(response.url);
                // Check if redirected to login page or similar auth pages
                if (redirectUrl.pathname.includes('login') || 
                    !redirectUrl.pathname.includes('/api/admin')) {
                    console.log("Detected redirect to login page. Session likely expired.");
                    localStorage.removeItem('isLoggedIn');
                    window.location.href = '/login';
                    return null;
                }
            }
            
            // Additional check for 3xx status codes
            if (response.status >= 300 && response.status < 400) {
                console.log(`Redirect status detected: ${response.status}. Handling potential auth issue.`);
                localStorage.removeItem('isLoggedIn');
                window.location.href = '/login';
                return null;
            }

            let data = null;
            const contentType = response.headers.get("content-type");
            if (contentType && contentType.indexOf("application/json") !== -1) {
                 try {
                    data = await response.json();
                 } catch (e) {
                    if (response.ok) {
                        console.warn("Received OK response but failed to parse JSON body.");
                        return { success: true };
                    } else {
                        const errorText = await response.text();
                        throw new Error(`HTTP error! status: ${response.status} ${response.statusText} - ${errorText}`);
                    }
                 }
            } else if (!response.ok) {
                 const errorText = await response.text();
                 throw new Error(`HTTP error! status: ${response.status} ${response.statusText} - ${errorText}`);
            } else {
                 console.log(`Received non-JSON response with status ${response.status}`);
                 return { success: true };
            }

            // 409 Conflict
            if (response.status === 409) {
                throw new Error(data?.error || 'Existing API key');
            }

            if (!response.ok) {
                throw new Error(data?.error || `HTTP error! status: ${response.status}`);
            }

            return data;
        } catch (error) {
            console.error('API Fetch Error:', error);
            if (suppressGlobalError) {
                throw error;
            }
            if (endpoint === '/category-quotas') {
                showError(error.message || 'An unknown error occurred.', categoryQuotasErrorDiv, categoryQuotasErrorDiv);
            } else {
                showError(error.message || 'An unknown error occurred.');
            }
            return null;
        } finally {
            hideLoading();
        }
    }

    // --- Rendering Functions ---

    // Helper to format quota display (Infinity becomes ∞)
    function formatQuota(quota) {
        return (quota === undefined || quota === null || quota === Infinity) ? '∞' : quota;
    }

    // Helper to calculate remaining percentage for progress bar
    function calculateRemainingPercentage(count, quota) {
        if (quota === undefined || quota === null || quota === Infinity || quota <= 0) {
            return 100;
        }
        const percentage = Math.max(0, 100 - (count / quota * 100));
        return percentage;
    }

    // Helper to get progress bar color based on percentage
    function getProgressColor(percentage) {
        if (percentage < 25) return 'bg-red-500';
        if (percentage < 50) return 'bg-yellow-500';
        return 'bg-green-500';
    }


async function renderGeminiKeys(keys) {
        geminiKeysListDiv.innerHTML = ''; // Clear previous list
        if (!keys || keys.length === 0) {
            geminiKeysListDiv.innerHTML = '<p class="text-gray-500">No Gemini keys configured.</p>';
            return;
        }

        // Ensure models and category quotas are cached (should be loaded in initialLoad)
        if (cachedModels.length === 0) {
            console.warn("Models cache is empty during renderGeminiKeys. Load may be incomplete.");
        }

        // Calculate statistics
        const totalKeys = keys.length;
        const totalUsage = keys.reduce((sum, key) => sum + (parseInt(key.usage) || 0), 0);
        
        // Create main container
        const keysContainer = document.createElement('div');
        keysContainer.className = 'keys-container';
        geminiKeysListDiv.appendChild(keysContainer);
        
        // Create statistics bar that's always visible
        const statsBar = document.createElement('div');
        // Removed justify-between, added relative for positioning context and select-none to prevent text selection
        statsBar.className = 'stats-bar relative flex items-center justify-center p-3 rounded-md mb-4 cursor-pointer transition-colors select-none';
        statsBar.innerHTML = `
            <div class="stats-info flex items-center space-x-8"> 
                 <div class="flex items-baseline">
                     <span class="text-sm font-bold text-gray-600 dark:text-gray-400 mr-1">API Keys:</span>
                     <span class="text-lg font-semibold text-blue-700 dark:text-blue-400">${totalKeys}</span>
                 </div>
                 <div class="flex items-baseline">
                     <span class="text-sm font-bold text-gray-600 dark:text-gray-400 mr-1">24hr Usage:</span>
                     <span class="text-lg font-semibold text-green-700 dark:text-green-400">${totalUsage}</span>
                 </div>
            </div>
            <div class="toggle-icon absolute right-3 top-1/2 transform -translate-y-1/2">
                <svg class="expand-icon w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
                </svg>
        <svg class="collapse-icon w-5 h-5 hidden text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7-7-7 7"></path>
        </svg>
            </div>
        `;
        keysContainer.appendChild(statsBar);
        
        // Create collapsible grid container
        const keysGrid = document.createElement('div');
        keysGrid.className = 'keys-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 transition-all duration-300 max-h-[60vh] overflow-y-auto';
        
        // Set initial expanded/collapsed state based on key count
        const isInitiallyExpanded = totalKeys <= 6;
        if (!isInitiallyExpanded) {
            keysGrid.classList.add('hidden');
        }
        
        // Update icon display
        const expandIcon = statsBar.querySelector('.expand-icon'); // Left arrow - collapsed state
        const collapseIcon = statsBar.querySelector('.collapse-icon'); // Down arrow - expanded state

        if (isInitiallyExpanded) {
            // Content expanded state (visible): show down arrow
            expandIcon.classList.add('hidden');
            collapseIcon.classList.remove('hidden');
        } else {
            // Content collapsed state (hidden): show left arrow
            expandIcon.classList.remove('hidden');
            collapseIcon.classList.add('hidden');
        }
        
        keysContainer.appendChild(keysGrid);

        // Add click event listener to toggle the grid visibility
        statsBar.addEventListener('click', (e) => {
            // 防止文本选择
            e.preventDefault();
            keysGrid.classList.toggle('hidden');
            expandIcon.classList.toggle('hidden');
            collapseIcon.classList.toggle('hidden');
        });

        keys.forEach(key => {
            // Create a simplified card for each key
            const cardItem = document.createElement('div');
            cardItem.className = 'card-item p-4 border rounded-md bg-white shadow-sm hover:shadow-md transition-shadow cursor-pointer select-none';
            cardItem.dataset.keyId = key.id;

            // Show warning icon
            let rightSideContent = '';
            if (key.errorStatus === 400 || key.errorStatus === 401 || key.errorStatus === 403) {
                rightSideContent = `
                    <div class="warning-icon-container">
                        <svg class="w-5 h-5 text-yellow-500 warning-icon" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                            <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 3.001-1.742 3.001H4.42c-1.53 0-2.493-1.667-1.743-3.001l5.58-9.92zM10 13a1 1 0 110-2 1 1 0 010 2zm0-8a1 1 0 011 1v3a1 1 0 11-2 0V6a1 1 0 011-1z" clip-rule="evenodd"></path>
                        </svg>
                    </div>
                `;
            } else {
                rightSideContent = `
                    <div class="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded-full">
                        Total: ${key.usage}
                    </div>
                `;
            }

            // Simple card content, displaying basic information only
            cardItem.innerHTML = `
                <div class="flex items-center justify-between">
                    <div>
                        <h3 class="font-medium text-gray-900">${key.name || key.id}</h3>
                        <p class="text-xs text-gray-500">ID: ${key.id} | ${key.keyPreview}</p>
                    </div>
                    ${rightSideContent}
                </div>
            `;


            keysGrid.appendChild(cardItem);

            // Create a hidden detailed information modal
            const detailModal = document.createElement('div');
            detailModal.className = 'fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 hidden';
            detailModal.dataset.modalFor = key.id;

            // --- Start Modal HTML ---
            let modalHTML = `
                <div class="modal-content bg-white rounded-lg shadow-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto mx-4">
                    <div class="flex justify-between items-center mb-4">
                        <h2 class="text-xl font-bold text-gray-800">${key.name || key.id}</h2>
                        <button class="close-modal text-gray-500 hover:text-gray-800">
                            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                            </svg>
                        </button>
                    </div>
                    <div class="grid grid-cols-2 gap-4 mb-4">
                        <div>
                            <p class="text-sm text-gray-600">${t('id')}: ${key.id}</p>
                            <p class="text-sm text-gray-600">${t('key_preview')}: ${key.keyPreview}</p>
                        </div>
                        <div>
                            <p class="text-sm text-gray-600">${t('total_usage_today')}: ${key.usage}</p>
                            <p class="text-sm text-gray-600">${t('date')}: ${key.usageDate}</p>
                            ${key.errorStatus ? `<p class="text-sm text-red-600 font-medium">${t('error_status')}: ${key.errorStatus}</p>` : ''}
                        </div>
                    </div>
                    <div class="flex justify-end space-x-2 mb-4">
                        ${key.errorStatus ? `<button data-id="${key.id}" class="clear-gemini-key-error text-yellow-600 hover:text-yellow-800 font-medium px-3 py-1 border border-yellow-600 rounded">${t('ignore_error')}</button>` : ''}
                        <button data-id="${key.id}" class="test-gemini-key text-blue-500 hover:text-blue-700 font-medium px-3 py-1 border border-blue-500 rounded">${t('test')}</button>
                        <button data-id="${key.id}" class="delete-gemini-key text-red-500 hover:text-red-700 font-medium px-3 py-1 border border-red-500 rounded">${t('delete')}</button>
                    </div>
                    <!-- Container for error messages within the modal -->
                    <div id="gemini-key-error-container-${key.id}" class="hidden bg-red-100 border border-red-400 text-red-700 px-4 py-2 rounded relative mb-4" role="alert">
                        <span class="block sm:inline"></span>
                    </div>

                    <!-- Category Usage Section -->
                    <div class="border-t border-gray-200 pt-4 mb-4">
                        <h3 class="text-lg font-medium text-gray-800 mb-3">${t('category_usage')}</h3>
                        <div class="space-y-4">
            `;

            // Pro Category Usage
            const proUsage = key.categoryUsage?.pro || 0;
            const proQuota = cachedCategoryQuotas.proQuota;
            const proQuotaDisplay = formatQuota(proQuota);
            const proRemaining = proQuota === Infinity ? Infinity : Math.max(0, proQuota - proUsage);
            const proRemainingDisplay = formatQuota(proRemaining);
            const proRemainingPercentage = calculateRemainingPercentage(proUsage, proQuota);
            const proProgressColor = getProgressColor(proRemainingPercentage);

            modalHTML += `
                <div>
                    <div class="flex justify-between mb-1">
                        <span class="text-sm font-medium text-gray-700">${t('pro_models')}</span>
                        <span class="text-sm font-medium text-gray-700">${proRemainingDisplay}/${proQuotaDisplay}</span>
                    </div>
                    <div class="w-full bg-gray-200 rounded-full h-2.5">
                        <div class="${proProgressColor} h-2.5 rounded-full" style="width: ${proRemainingPercentage}%"></div>
                    </div>
                </div>
            `;

            // Handle Pro category individual quota models
            const proModelsWithIndividualQuota = cachedModels.filter(model => 
                model.category === 'Pro' && 
                model.individualQuota && 
                key.modelUsage && 
                key.modelUsage[model.id] !== undefined
            );

            if (proModelsWithIndividualQuota.length > 0) {
            proModelsWithIndividualQuota.forEach(model => {
                    const modelId = model.id;
                    // Check if it's an object structure, if so, extract the count property
                    const count = typeof key.modelUsage?.[modelId] === 'object' ? 
                        (key.modelUsage?.[modelId]?.count || 0) : 
                        (key.modelUsage?.[modelId] || 0);
                    const quota = model.individualQuota;
                    const quotaDisplay = formatQuota(quota);
                    const remaining = quota === Infinity ? Infinity : Math.max(0, quota - count);
                    const remainingDisplay = formatQuota(remaining);
                    const remainingPercentage = calculateRemainingPercentage(count, quota);
                    const progressColor = getProgressColor(remainingPercentage);

                    modalHTML += `
                        <div class="mt-2">
                            <div class="flex justify-between mb-1">
                                <span class="text-sm font-medium text-gray-700">${modelId}</span>
                                <span class="text-sm font-medium text-gray-700">${remainingDisplay}/${quotaDisplay}</span>
                            </div>
                            <div class="w-full bg-gray-200 rounded-full h-2.5">
                                <div class="${progressColor} h-2.5 rounded-full" style="width: ${remainingPercentage}%"></div>
                            </div>
                        </div>
                    `;
                });
            }

            // Flash Category Usage
            const flashUsage = key.categoryUsage?.flash || 0;
            const flashQuota = cachedCategoryQuotas.flashQuota;
            const flashQuotaDisplay = formatQuota(flashQuota);
            const flashRemaining = flashQuota === Infinity ? Infinity : Math.max(0, flashQuota - flashUsage);
            const flashRemainingDisplay = formatQuota(flashRemaining);
            const flashRemainingPercentage = calculateRemainingPercentage(flashUsage, flashQuota);
            const flashProgressColor = getProgressColor(flashRemainingPercentage);

            modalHTML += `
                <div class="mt-2">
                    <div class="flex justify-between mb-1">
                        <span class="text-sm font-medium text-gray-700">${t('flash_models')}</span>
                        <span class="text-sm font-medium text-gray-700">${flashRemainingDisplay}/${flashQuotaDisplay}</span>
                    </div>
                    <div class="w-full bg-gray-200 rounded-full h-2.5">
                        <div class="${flashProgressColor} h-2.5 rounded-full" style="width: ${flashRemainingPercentage}%"></div>
                    </div>
                </div>
            `;
            
            // Handle Flash category individual quota models
            const flashModelsWithIndividualQuota = cachedModels.filter(model => 
                model.category === 'Flash' && 
                model.individualQuota && 
                key.modelUsage && 
                key.modelUsage[model.id] !== undefined
            );

            if (flashModelsWithIndividualQuota.length > 0) {
                flashModelsWithIndividualQuota.forEach(model => {
                    const modelId = model.id;
                    // Check if it's an object structure, if so, extract the count property
                    const count = typeof key.modelUsage?.[modelId] === 'object' ? 
                        (key.modelUsage?.[modelId]?.count || 0) : 
                        (key.modelUsage?.[modelId] || 0);
                    const quota = model.individualQuota;
                    const quotaDisplay = formatQuota(quota);
                    const remaining = quota === Infinity ? Infinity : Math.max(0, quota - count);
                    const remainingDisplay = formatQuota(remaining);
                    const remainingPercentage = calculateRemainingPercentage(count, quota);
                    const progressColor = getProgressColor(remainingPercentage);

                    modalHTML += `
                        <div class="mt-2">
                            <div class="flex justify-between mb-1">
                                <span class="text-sm font-medium text-gray-700">${modelId}</span>
                                <span class="text-sm font-medium text-gray-700">${remainingDisplay}/${quotaDisplay}</span>
                            </div>
                            <div class="w-full bg-gray-200 rounded-full h-2.5">
                                <div class="${progressColor} h-2.5 rounded-full" style="width: ${remainingPercentage}%"></div>
                            </div>
                        </div>
                    `;
                });
            }

            modalHTML += `
                        </div>
                    </div>
            `;

            // Custom Model Usage Section (Only if there are custom models used by this key)
            const customModelUsageEntries = Object.entries(key.modelUsage || {})
                .filter(([modelId, usageData]) => {
                    const model = cachedModels.find(m => m.id === modelId);
                    return model?.category === 'Custom';
                });

            if (customModelUsageEntries.length > 0) {
                modalHTML += `
                    <div class="border-t border-gray-200 pt-4 mb-4">
                        <h3 class="text-lg font-medium text-gray-800 mb-3">Custom Model Usage</h3>
                        <div class="space-y-4">
                `;

                customModelUsageEntries.forEach(([modelId, usageData]) => {
                    // Ensure count is obtained correctly, regardless of object structure
                    const count = typeof usageData === 'object' ? 
                        (usageData.count || 0) : (usageData || 0);
                    const quota = typeof usageData === 'object' ? 
                        usageData.quota : undefined; // Quota is now included in the key data for custom models
                    const quotaDisplay = formatQuota(quota);
                    const remaining = quota === Infinity ? Infinity : Math.max(0, quota - count);
                    const remainingDisplay = formatQuota(remaining);
                    const remainingPercentage = calculateRemainingPercentage(count, quota);
                    const progressColor = getProgressColor(remainingPercentage);

                    modalHTML += `
                        <div>
                            <div class="flex justify-between mb-1">
                                <span class="text-sm font-medium text-gray-700">${modelId}</span>
                                <span class="text-sm font-medium text-gray-700">${remainingDisplay}/${quotaDisplay}</span>
                            </div>
                            <div class="w-full bg-gray-200 rounded-full h-2.5">
                                <div class="${progressColor} h-2.5 rounded-full" style="width: ${remainingPercentage}%"></div>
                            </div>
                        </div>
                    `;
                });

                modalHTML += `
                        </div>
                    </div>
                `;
            }


            // Add test section (remains mostly the same, uses cachedModels)
            modalHTML += `
                <div class="test-model-section mt-3 border-t pt-4 hidden" data-key-id="${key.id}">
                    <h3 class="text-lg font-medium text-gray-800 mb-2">${t('test_api_key')}</h3>
                    <div class="flex items-center">
                        <select class="model-select mr-2 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm">
                            <option value="">${t('select_a_model')}</option>
                            ${cachedModels.map(model => `<option value="${model.id}">${model.id}</option>`).join('')}
                        </select>
                        <button class="run-test-btn inline-flex justify-center py-1 px-3 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500">
                            ${t('run_test')}
                        </button>
                    </div>
                    <div class="test-result mt-2 hidden">
                        <pre class="text-xs bg-gray-100 p-2 rounded overflow-x-auto"></pre>
                    </div>
                </div>
            `;

            // Close modal div
            modalHTML += `</div>`;
            // --- End Modal HTML ---

            detailModal.innerHTML = modalHTML;
            document.body.appendChild(detailModal);


            // Add click event to the card to display the detailed information modal
            cardItem.addEventListener('click', (e) => {
                // 防止文本选择
                e.preventDefault();
                detailModal.classList.remove('hidden');
            });

            // Add event to the close button
            const closeBtn = detailModal.querySelector('.close-modal');
            closeBtn.addEventListener('click', () => {
                detailModal.classList.add('hidden');
            });

            // Close by clicking outside the modal
            detailModal.addEventListener('click', (e) => {
                if (e.target === detailModal) {
                    detailModal.classList.add('hidden');
                }
            });
        });

        // Add test button click event (no changes needed here)
        document.querySelectorAll('.test-gemini-key').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const keyId = e.target.dataset.id;
                const testSection = document.querySelector(`.test-model-section[data-key-id="${keyId}"]`);

                // Toggle display status
                if (testSection.classList.contains('hidden')) {
                    // Hide all other test areas
                    document.querySelectorAll('.test-model-section').forEach(section => {
                        section.classList.add('hidden');
                        section.querySelector('.test-result')?.classList.add('hidden');
                    });

                    // Show current test area
                    testSection.classList.remove('hidden');
                } else {
                    testSection.classList.add('hidden');
                }
            });
        });

        // Add run test button click event（修正：测试报错只显示在测试区域）
        document.querySelectorAll('.run-test-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const testSection = e.target.closest('.test-model-section');
                const keyId = testSection.dataset.keyId;
                const modelId = testSection.querySelector('.model-select').value;
                const resultDiv = testSection.querySelector('.test-result');
                const resultPre = resultDiv.querySelector('pre');

                if (!modelId) {
                    showError(t('please_select_model'));
                    return;
                }

                // Show result area and set "Loading" text
                resultDiv.classList.remove('hidden');
                resultPre.textContent = t('testing');

                // Send test request directly to handle both success and error responses
                let result = null;
                try {
                    // Use direct fetch instead of apiFetch to get raw response
                    const response = await fetch('/api/admin/test-gemini-key', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        credentials: 'include',
                        body: JSON.stringify({ keyId, modelId })
                    });

                    // Parse response regardless of status code
                    const contentType = response.headers.get("content-type");
                    if (contentType && contentType.indexOf("application/json") !== -1) {
                        result = await response.json();
                    } else {
                        const textContent = await response.text();
                        result = {
                            success: false,
                            status: response.status,
                            content: textContent || 'No response content'
                        };
                    }

                    if (result) {
                        const formattedContent = typeof result.content === 'object'
                            ? JSON.stringify(result.content, null, 2)
                            : result.content;

                        if (result.success) {
                            resultPre.textContent = `${t('test_passed')}\n${t('status')}: ${result.status}\n\n${t('response')}:\n${formattedContent}`;
                            resultPre.className = 'text-xs bg-green-50 text-green-800 p-2 rounded overflow-x-auto';
                        } else {
                            resultPre.textContent = `${t('test_failed')}\n${t('status')}: ${result.status}\n\n${t('response')}:\n${formattedContent}`;
                            resultPre.className = 'text-xs bg-red-50 text-red-800 p-2 rounded overflow-x-auto';
                        }
                    } else {
                        resultPre.textContent = t('test_failed_no_response');
                        resultPre.className = 'text-xs bg-red-50 text-red-800 p-2 rounded overflow-x-auto';
                    }
                } catch (error) {
                    // 只在测试区域显示网络错误
                    resultPre.textContent = t('test_failed_network', error.message || t('unknown_error'));
                    resultPre.className = 'text-xs bg-red-50 text-red-800 p-2 rounded overflow-x-auto';
                }
            });
        });
    }

    function renderWorkerKeys(keys) {
        workerKeysListDiv.innerHTML = ''; // Clear previous list
        if (!keys || keys.length === 0) {
            workerKeysListDiv.innerHTML = '<p class="text-gray-500">No Worker keys configured.</p>';
            return;
        }

        keys.forEach(key => {
            const isSafetyEnabled = key.safetyEnabled !== undefined ? key.safetyEnabled : true;

            const item = document.createElement('div');
            item.className = 'p-3 border rounded-md';
            item.innerHTML = `
                <div class="flex items-center justify-between mb-2">
                    <div>
                        <p class="font-mono text-sm text-gray-700">${key.key}</p>
                        <p class="text-xs text-gray-500">${key.description || t('no_description')} (${t('created')}: ${new Date(key.createdAt).toLocaleDateString()})</p>
                    </div>
                    <button data-key="${key.key}" class="delete-worker-key text-red-500 hover:text-red-700 font-medium">${t('delete')}</button>
                </div>
                <div class="flex items-center mt-2 border-t pt-2">
                    <div class="flex items-center">
                        <label for="safety-toggle-${key.key}" class="text-sm font-medium text-gray-700 mr-2">${t('safety_settings')}:</label>
                        <div class="relative inline-block w-10 mr-2 align-middle select-none">
                            <input type="checkbox" id="safety-toggle-${key.key}"
                                data-key="${key.key}"
                                class="safety-toggle toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer transition-transform duration-200 ease-in-out"
                                ${isSafetyEnabled ? 'checked' : ''}
                            />
                            <label for="safety-toggle-${key.key}"
                                class="toggle-label block overflow-hidden h-6 rounded-full bg-gray-300 cursor-pointer"
                            ></label>
                        </div>
                        <span class="text-xs font-medium ${isSafetyEnabled ? 'text-green-600' : 'text-red-600'}">
                            ${isSafetyEnabled ? t('enabled') : t('disabled')}
                        </span>
                    </div>
                </div>
            `;

            workerKeysListDiv.appendChild(item);
        });

        // Add styles for toggle switch
        const style = document.createElement('style');
        style.textContent = `
            .toggle-checkbox:checked {
                /* Adjusted translation to keep handle within bounds */
                transform: translateX(1rem); /* Was 100% */
                border-color: #68D391;
            }
            .toggle-checkbox:checked + .toggle-label {
                background-color: #68D391;
            }
            .toggle-label {
                transition: background-color 0.2s ease-in-out;
            }
        `;
        document.head.appendChild(style);

        // Add event listeners for safety toggles
        document.querySelectorAll('.safety-toggle').forEach(toggle => {
            toggle.addEventListener('change', function() {
                const key = this.dataset.key;
                const isEnabled = this.checked;
                const statusText = this.parentElement.nextElementSibling;
                statusText.textContent = isEnabled ? t('enabled') : t('disabled');
                statusText.className = `text-xs font-medium ${isEnabled ? 'text-green-600' : 'text-red-600'}`;
                saveSafetySettingsToServer(key, isEnabled);

                console.log(`Safety settings for key ${key} set to ${isEnabled ? 'enabled' : 'disabled'}`);
            });
        });
    }

     function renderModels(models) {
        modelsListDiv.innerHTML = ''; // Clear previous list
         if (!models || models.length === 0) {
            modelsListDiv.innerHTML = '<p class="text-gray-500">No models configured.</p>';
            return;
        }
        models.forEach(model => {
            const item = document.createElement('div');
            item.className = 'p-3 border rounded-md flex items-center justify-between';
            
            let quotaDisplay = model.category;
            if (model.category === 'Custom') {
                quotaDisplay += ` (${t('quota')}: ${model.dailyQuota === undefined ? t('unlimited') : model.dailyQuota})`;
            } else if (model.individualQuota) {
                // Show individual quota if it exists for Pro/Flash models
                quotaDisplay += ` (${t('individual_quota')}: ${model.individualQuota})`;
            }

            let actionsHtml = '';
            // Only show Set Individual Quota button for Pro and Flash models
            if (model.category === 'Pro' || model.category === 'Flash') {
                actionsHtml = `
                    <button data-id="${model.id}" data-category="${model.category}" data-quota="${model.individualQuota || 0}"
                        class="set-individual-quota mr-2 text-blue-500 hover:text-blue-700 font-medium">
                        ${t('set_quota_btn')}
                    </button>
                `;
            }
            actionsHtml += `<button data-id="${model.id}" class="delete-model text-red-500 hover:text-red-700 font-medium">${t('delete')}</button>`;

            item.innerHTML = `
                <div>
                    <p class="font-semibold text-gray-800">${model.id}</p>
                    <p class="text-xs text-gray-500">${quotaDisplay}</p>
                </div>
                <div class="flex items-center">
                    ${actionsHtml}
                </div>
            `;
            modelsListDiv.appendChild(item);
        });

        // Add event listeners for individual quota buttons
        document.querySelectorAll('.set-individual-quota').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modelId = e.target.dataset.id;
                const category = e.target.dataset.category;
                const currentQuota = parseInt(e.target.dataset.quota, 10);
                
                // Set the form values
                individualQuotaModelIdInput.value = modelId;
                individualQuotaValueInput.value = currentQuota || 0;
                
                // Show the modal
                hideError(individualQuotaErrorDiv);
                individualQuotaModal.classList.remove('hidden');
            });
        });
    }

    // --- Data Loading Functions ---
    async function loadGeminiKeys() {
        const keys = await apiFetch('/gemini-keys');
        if (keys) {
            renderGeminiKeys(keys);
        } else {
             geminiKeysListDiv.innerHTML = '<p class="text-red-500">Failed to load Gemini keys.</p>';
        }
    }

    async function loadWorkerKeys() {
        const keys = await apiFetch('/worker-keys');
        if (keys) {
            renderWorkerKeys(keys);
        } else {
             workerKeysListDiv.innerHTML = '<p class="text-red-500">Failed to load Worker keys.</p>';
        }
    }

    async function loadModels() {
        const models = await apiFetch('/models');
        if (models) {
            cachedModels = models;
            renderModels(models);
        } else {
             modelsListDiv.innerHTML = '<p class="text-red-500">Failed to load models.</p>';
        }
    }

    // New function to load category quotas
    async function loadCategoryQuotas() {
        const quotas = await apiFetch('/category-quotas');
        if (quotas) {
            cachedCategoryQuotas = quotas;
        } else {
            showError("Failed to load category quotas.");
        }
        return quotas;
    }

    // New function to load available Gemini models
    async function loadGeminiAvailableModels() {
        // Only proceed if we have Gemini keys
        const geminiKeysList = document.querySelectorAll('#gemini-keys-list .card-item');
        if (geminiKeysList.length === 0) {
            console.log("No Gemini keys available, skipping model list fetch");
            return;
        }
        
        try {
            const models = await apiFetch('/gemini-models');
            if (models && Array.isArray(models)) {
                cachedGeminiModels = models;
                
                // Update the model-id input field to include dropdown
                updateModelIdDropdown(models);
                
                console.log(`Loaded ${models.length} available Gemini models`);
            }
        } catch (error) {
            console.error("Failed to load Gemini models:", error);
        }
    }

    // Update the model-id input to include dropdown functionality
    function updateModelIdDropdown(models) {
        if (!modelIdInput) return;
        
        // Create custom dropdown menu
        const createCustomDropdown = () => {
            // Remove old dropdown menu (if it exists)
            const existingDropdown = document.getElementById('custom-model-dropdown');
            if (existingDropdown) {
                existingDropdown.remove();
            }
            
            // Create new dropdown menu container
            const dropdownContainer = document.createElement('div');
            dropdownContainer.id = 'custom-model-dropdown';
            dropdownContainer.className = 'absolute z-10 mt-1 w-full bg-white shadow-lg max-h-60 rounded-md py-1 text-base overflow-auto focus:outline-none sm:text-sm hidden';
            dropdownContainer.style.maxHeight = '200px';
            dropdownContainer.style.overflowY = 'auto';
            dropdownContainer.style.border = '1px solid #d1d5db';
            
            // Add model options to the dropdown menu
            models.forEach(model => {
                const option = document.createElement('div');
                option.className = 'cursor-pointer select-none relative py-2 pl-3 pr-9 hover:bg-gray-100';
                option.textContent = model.id;
                option.dataset.value = model.id;
                
                option.addEventListener('click', () => {
                    modelIdInput.value = model.id;
                    dropdownContainer.classList.add('hidden');
                    
                    // Automatically select category based on model name
                    const modelValue = model.id.toLowerCase();
                    if (modelValue.includes('pro')) {
                        modelCategorySelect.value = 'Pro';
                        customQuotaDiv.classList.add('hidden');
                        modelQuotaInput.required = false;
                    } else if (modelValue.includes('flash')) {
                        modelCategorySelect.value = 'Flash';
                        customQuotaDiv.classList.add('hidden');
                        modelQuotaInput.required = false;
                    }
                    
                    // Trigger input event so other listeners can respond
                    modelIdInput.dispatchEvent(new Event('input'));
                });
                
                dropdownContainer.appendChild(option);
            });
            
            // Add the dropdown menu to the input element's parent
            modelIdInput.parentNode.appendChild(dropdownContainer);
            
            return dropdownContainer;
        };
        
        // Create dropdown menu
        const dropdown = createCustomDropdown();
        console.log(`Created custom dropdown with ${models.length} model options`);
        
        // Add input event to automatically select category based on model name and filter dropdown options
        modelIdInput.addEventListener('input', function() {
            const modelValue = this.value.toLowerCase();
            
            // Filter dropdown options based on input value
            const options = dropdown.querySelectorAll('div[data-value]');
            let hasVisibleOptions = false;
            
            options.forEach(option => {
                const optionValue = option.dataset.value.toLowerCase();
                if (optionValue.includes(modelValue)) {
                    option.style.display = 'block';
                    hasVisibleOptions = true;
                } else {
                    option.style.display = 'none';
                }
            });
            
            // If there are matching options, show the dropdown menu
            if (hasVisibleOptions && modelValue) {
                dropdown.classList.remove('hidden');
            } else {
                dropdown.classList.add('hidden');
            }
            
            // Automatically select category based on input value
            if (modelValue.includes('pro')) {
                modelCategorySelect.value = 'Pro';
                customQuotaDiv.classList.add('hidden');
                modelQuotaInput.required = false;
            } else if (modelValue.includes('flash')) {
                modelCategorySelect.value = 'Flash';
                customQuotaDiv.classList.add('hidden');
                modelQuotaInput.required = false;
            }
        });
        
        // Add click event to show the dropdown menu
        modelIdInput.addEventListener('click', function() {
            if (models.length > 0) {
                // Show all options
                const options = dropdown.querySelectorAll('div[data-value]');
                options.forEach(option => {
                    option.style.display = 'block';
                });
                
                dropdown.classList.remove('hidden');
            }
        });
        
        // Hide dropdown menu when clicking elsewhere on the page
        document.addEventListener('click', function(e) {
            if (e.target !== modelIdInput && !dropdown.contains(e.target)) {
                dropdown.classList.add('hidden');
            }
        });
        
        // Remove datalist attribute from input if it exists
        modelIdInput.removeAttribute('list');
    }


    // --- Event Handlers ---

    // Add Gemini Key with support for batch input
    addGeminiKeyForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(addGeminiKeyForm);
        const data = Object.fromEntries(formData.entries());
        const geminiKeyInput = data.key ? data.key.trim() : '';

        // Check if input is empty
        if (!geminiKeyInput) {
             showError("API Key Value is required.");
             return;
        }

        // Split input, supporting comma-separated keys
        const geminiKeys = geminiKeyInput.split(',').map(key => key.trim()).filter(key => key !== '');
        
        // Check if there are any keys to process
        if (geminiKeys.length === 0) {
            showError("No valid API Keys found.");
            return;
        }

        // Gemini API Key format validation regex
        const geminiKeyRegex = /^AIzaSy[A-Za-z0-9_-]{33}$/;
        
        // Check format and remove duplicates
        const validKeys = [];
        const invalidKeys = [];
        const seenKeys = new Set();
        
        for (const key of geminiKeys) {
            // Skip duplicates
            if (seenKeys.has(key)) {
                continue;
            }
            
            seenKeys.add(key);
            
            // Validate format
            if (!geminiKeyRegex.test(key)) {
                invalidKeys.push(key);
            } else {
                validKeys.push(key);
            }
        }
        
        // If no valid keys, exit
        if (validKeys.length === 0) {
            showError("No valid API Keys found. Please check the format.");
            return;
        }
        
        // Show warnings about invalid keys but continue with valid ones
        if (invalidKeys.length > 0) {
            const maskedInvalidKeys = invalidKeys.map(key => {
                if (key.length > 10) {
                    return `${key.substring(0, 6)}...${key.substring(key.length - 4)}`;
                }
                return key;
            });
            showError(`Invalid API key format detected: ${maskedInvalidKeys.join(', ')}`);
        }
        
        // 改为串行处理API密钥添加，避免并发请求导致的问题
        showLoading();
        let successCount = 0;
        
        // 逐个处理每个API Key
        for (const key of validKeys) {
            let keyData = { key: key }; // Base data

            // Only include name if adding a single key
            if (validKeys.length === 1 && data.name) {
                keyData.name = data.name.trim();
            }

            try {
                const result = await apiFetch('/gemini-keys', {
                    method: 'POST',
                    body: JSON.stringify(keyData),
                });
                
                if (result && result.success) {
                    successCount++;
                }
            } catch (error) {
                console.error(`Error adding key ${key}:`, error);
                // 继续处理下一个密钥
            }
        }
        
        const failureCount = validKeys.length - successCount;
        
        // Reset form and reload keys
        addGeminiKeyForm.reset();
        await loadGeminiKeys();
        
        // Show appropriate message based on results
        if (successCount > 0) {
            showSuccess(`Successfully added ${successCount} Gemini ${successCount === 1 ? 'key' : 'keys'}.`);
        } else {
            showError(`Failed to add any keys.`);
        }
    });

    // Delete Gemini Key (no changes needed)
    document.addEventListener('click', async (e) => {
        if (e.target.classList.contains('delete-gemini-key')) {
            const keyId = e.target.dataset.id;
            if (confirm(t('delete_confirm_gemini', keyId))) {
                const modal = e.target.closest('.fixed.inset-0');
                if (modal) {
                    modal.classList.add('hidden');
                }

                const result = await apiFetch(`/gemini-keys/${encodeURIComponent(keyId)}`, {
                    method: 'DELETE',
                });
                if (result && result.success) {
                    await loadGeminiKeys(); // Wait for the list to reload
                    showSuccess(`Gemini key ${keyId} deleted successfully!`);
                }
            }
        }

        // --- New: Clear Gemini Key Error ---
        if (e.target.classList.contains('clear-gemini-key-error')) {
            const keyId = e.target.dataset.id;
            const button = e.target;
            const modalErrorContainer = document.getElementById(`gemini-key-error-container-${keyId}`);
            const modalErrorSpan = modalErrorContainer?.querySelector('span');

            if (confirm(`Are you sure you want to clear the error status for key: ${keyId}?`)) {
                const result = await apiFetch('/clear-key-error', {
                    method: 'POST',
                    body: JSON.stringify({ keyId }),
                });

                if (result && result.success) {
                    // Get the corresponding card and data
                    const cardItem = document.querySelector(`.card-item[data-key-id="${keyId}"]`);
                    
                    // Find the current key's data to get the usage value
                    const keyData = result.updatedKey || { usage: 0 }; // Use the updated key data from the API response if available, otherwise default to 0
                    
                    // Replace the warning icon container with the Total display
                    const warningContainer = cardItem?.querySelector('.warning-icon-container');
                    if (warningContainer) {
                        const totalHTML = `
                            <div class="text-xs px-2 py-1 bg-blue-100 text-blue-800 rounded-full">
                                Total: ${keyData.usage || '0'}
                            </div>
                        `;
                        warningContainer.outerHTML = totalHTML;
                    }
                    
                    // Remove error status text from modal
                    const errorStatusP = button.closest('.modal-content').querySelector('p.text-red-600');
                    if (errorStatusP) {
                        errorStatusP.remove();
                    }
                    
                    // Remove the button itself
                    button.remove();
                    showSuccess(`Error status cleared for key ${keyId}.`);
                } else {
                    // Show error within the modal
                    if (modalErrorContainer && modalErrorSpan) {
                        modalErrorSpan.textContent = result?.error || 'Failed to clear error status.';
                        modalErrorContainer.classList.remove('hidden');
                         setTimeout(() => modalErrorContainer.classList.add('hidden'), 5000);
                    } else {
                        showError(result?.error || 'Failed to clear error status.'); // Fallback to global error
                    }
                }
            }
        }
        // --- End Clear Gemini Key Error ---
    });

     // Add Worker Key with validation
    addWorkerKeyForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(addWorkerKeyForm);
        const data = Object.fromEntries(formData.entries());
        
        // Validate worker key format - allow alphanumeric, hyphens, and underscores
        const workerKeyValue = data.key?.trim();
        if (!workerKeyValue) {
            showError('Worker key is required.');
            return;
        }
        
        const validKeyRegex = /^[a-zA-Z0-9_\-]+$/;
        if (!validKeyRegex.test(workerKeyValue)) {
            showError('Worker key can only contain letters, numbers, underscores (_), and hyphens (-).');
            return;
        }
        
        const result = await apiFetch('/worker-keys', {
            method: 'POST',
            body: JSON.stringify(data),
        });
        if (result && result.success) {
            addWorkerKeyForm.reset();
            await loadWorkerKeys(); // Wait for the list to reload
            showSuccess('Worker key added successfully!');
        }
    });

     // Delete Worker Key (no changes needed)
    workerKeysListDiv.addEventListener('click', async (e) => {
        if (e.target.classList.contains('delete-worker-key')) {
            const key = e.target.dataset.key;

             // Use key in the path for deletion, matching backend expectation
            if (confirm(t('delete_confirm_worker', key))) {
                const result = await apiFetch(`/worker-keys/${encodeURIComponent(key)}`, {
                    method: 'DELETE',
                });
                if (result && result.success) {
                    await loadWorkerKeys(); // Wait for the list to reload
                    showSuccess(`Worker key ${key} deleted successfully!`);
                }
            }
        }
    });

    // Save safety settings (no changes needed)
    async function saveSafetySettingsToServer(key, isEnabled) {
        try {
            const result = await apiFetch('/worker-keys/safety-settings', {
                method: 'POST',
                body: JSON.stringify({
                    key: key,
                    safetyEnabled: isEnabled
                }),
            });
            if (!result || !result.success) {
                console.error('Failed to save safety settings to server');
                showError('Failed to sync safety settings with server. Changes may not persist across browsers.');
            }
        } catch (error) {
            console.error('Error saving safety settings to server:', error);
            showError('Failed to sync safety settings with server. Changes may not persist across browsers.');
        }
    }

    // Generate Random Worker Key with valid format
    generateWorkerKeyBtn.addEventListener('click', () => {
        const validChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let randomKey = 'sk-';
        
        for (let i = 0; i < 20; i++) {
            const randomIndex = Math.floor(Math.random() * validChars.length);
            randomKey += validChars[randomIndex];
        }
        
        workerKeyValueInput.value = randomKey;
    });

    // --- Model Form Logic ---
    // Show/hide Custom Quota input based on category selection
    modelCategorySelect.addEventListener('change', (e) => {
        if (e.target.value === 'Custom') {
            customQuotaDiv.classList.remove('hidden');
            modelQuotaInput.required = true;
        } else {
            customQuotaDiv.classList.add('hidden');
            modelQuotaInput.required = false;
            modelQuotaInput.value = '';
        }
    });

    // Add/Update Model - Modified Submit Handler
    addModelForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(addModelForm);
        const data = {
            id: formData.get('id').trim(),
            category: formData.get('category')
        };

        // Only include dailyQuota if category is 'Custom' and input is visible/filled
        if (data.category === 'Custom') {
            const quotaInput = formData.get('dailyQuota')?.trim().toLowerCase();
            if (quotaInput === undefined || quotaInput === null || quotaInput === '') {
                 showError("Daily Quota is required for Custom models. Enter a positive number, 'none', or '0'.");
                 return; // Stop submission
            }

            if (quotaInput === 'none' || quotaInput === '0') {
            } else {
                const quotaValue = parseInt(quotaInput, 10);
                if (isNaN(quotaValue) || quotaValue <= 0 || quotaInput !== quotaValue.toString()) {
                     showError("Daily Quota for Custom models must be a positive whole number, 'none', or '0'.");
                     return;
                }
                data.dailyQuota = quotaValue;
            }
        }

        const result = await apiFetch('/models', {
            method: 'POST',
            body: JSON.stringify(data),
        });

        if (result && result.success) {
            addModelForm.reset();
            customQuotaDiv.classList.add('hidden');
            modelQuotaInput.required = false;
            await loadModels(); // Wait for models to reload
            await loadGeminiKeys(); // Wait for gemini keys to reload (as model changes affect them)
            showSuccess(`Model ${data.id} added/updated successfully!`);
        }
    });

     // Delete Model (no changes needed)
    modelsListDiv.addEventListener('click', async (e) => {
        if (e.target.classList.contains('delete-model')) {
            const modelId = e.target.dataset.id;

             // Use model ID in the path for deletion, matching backend expectation
            if (confirm(t('delete_confirm_model', modelId))) {
                const result = await apiFetch(`/models/${encodeURIComponent(modelId)}`, {
                    method: 'DELETE',
                });
                if (result && result.success) {
                    await loadModels(); // Wait for models to reload
                    await loadGeminiKeys(); // Wait for gemini keys to reload
                    showSuccess(`Model ${modelId} deleted successfully!`);
                }
            }
        }
    });

    // --- Category Quotas Modal Logic ---
    setCategoryQuotasBtn.addEventListener('click', async () => {
        hideError(categoryQuotasErrorDiv);
        const currentQuotas = await loadCategoryQuotas();
        if (currentQuotas) {
            proQuotaInput.value = currentQuotas.proQuota ?? 50;
            flashQuotaInput.value = currentQuotas.flashQuota ?? 1500;
            
            // Set placeholders to show default values
            proQuotaInput.placeholder = "Default: 50";
            flashQuotaInput.placeholder = "Default: 1500";
            
            categoryQuotasModal.classList.remove('hidden');
        } else {
            showError("Could not load current category quotas.", categoryQuotasErrorDiv, categoryQuotasErrorDiv);
        }
    });

    closeCategoryQuotasModalBtn.addEventListener('click', () => {
        categoryQuotasModal.classList.add('hidden');
    });

    cancelCategoryQuotasBtn.addEventListener('click', () => {
        categoryQuotasModal.classList.add('hidden');
    });

    categoryQuotasModal.addEventListener('click', (e) => {
        if (e.target === categoryQuotasModal) {
            categoryQuotasModal.classList.add('hidden');
        }
    });

    categoryQuotasForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideError(categoryQuotasErrorDiv);

        const proQuota = parseInt(proQuotaInput.value, 10);
        const flashQuota = parseInt(flashQuotaInput.value, 10);

        if (isNaN(proQuota) || proQuota < 0 || isNaN(flashQuota) || flashQuota < 0) {
            showError("Quotas must be non-negative numbers.", categoryQuotasErrorDiv, categoryQuotasErrorDiv);
            return;
        }

        const result = await apiFetch('/category-quotas', {
            method: 'POST',
            body: JSON.stringify({ proQuota, flashQuota }),
        });

        if (result && result.success) {
            cachedCategoryQuotas = { proQuota, flashQuota };
            categoryQuotasModal.classList.add('hidden');
            await loadGeminiKeys(); // Wait for gemini keys to reload
            showSuccess('Category quotas saved successfully!');
        } else {
            // Error already shown by apiFetch
             showError(result?.error || "Failed to save category quotas.", categoryQuotasErrorDiv, categoryQuotasErrorDiv);
        }
    });

    // --- Individual Quota Modal Logic ---
    closeIndividualQuotaModalBtn.addEventListener('click', () => {
        individualQuotaModal.classList.add('hidden');
    });

    cancelIndividualQuotaBtn.addEventListener('click', () => {
        individualQuotaModal.classList.add('hidden');
    });

    // --- Run All Test Logic ---
    runAllTestBtn.addEventListener('click', async () => {
        if (isRunningAllTests) {
            return; // Prevent multiple concurrent tests
        }

        await runAllGeminiKeysTest();
    });

    cancelAllTestBtn.addEventListener('click', () => {
        testCancelRequested = true;
        testStatusText.textContent = t('cancelling_tests');
        cancelAllTestBtn.disabled = true;
    });

    individualQuotaModal.addEventListener('click', (e) => {
        if (e.target === individualQuotaModal) {
            individualQuotaModal.classList.add('hidden');
        }
    });

    individualQuotaForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideError(individualQuotaErrorDiv);

        const modelId = individualQuotaModelIdInput.value;
        const individualQuota = parseInt(individualQuotaValueInput.value, 10);

        if (isNaN(individualQuota) || individualQuota < 0) {
            showError("Individual quota must be a non-negative number.", individualQuotaErrorDiv, individualQuotaErrorDiv);
            return;
        }

        // Find the existing model to update
        const modelToUpdate = cachedModels.find(m => m.id === modelId);
        if (!modelToUpdate) {
            showError(`Model ${modelId} not found.`, individualQuotaErrorDiv, individualQuotaErrorDiv);
            return;
        }

        // Create the payload with existing data plus the new individualQuota
        const payload = {
            id: modelId,
            category: modelToUpdate.category,
            individualQuota: individualQuota > 0 ? individualQuota : undefined // If 0, set to undefined to remove quota
        };

        // If it's a Custom model, preserve the dailyQuota
        if (modelToUpdate.category === 'Custom' && modelToUpdate.dailyQuota) {
            payload.dailyQuota = modelToUpdate.dailyQuota;
        }

        const result = await apiFetch('/models', {
            method: 'POST',
            body: JSON.stringify(payload),
        });

        if (result && result.success) {
            individualQuotaModal.classList.add('hidden');
            await loadModels(); // Reload models to show updated quota
            await loadGeminiKeys(); // Reload keys as they display model usage
            
            if (individualQuota > 0) {
                showSuccess(`Individual quota for ${modelId} set to ${individualQuota}.`);
            } else {
                showSuccess(`Individual quota for ${modelId} removed.`);
            }
        } else {
            showError(result?.error || "Failed to set individual quota.", individualQuotaErrorDiv, individualQuotaErrorDiv);
        }
    });


    // Verify if the user is authorized; redirect directly if not
    async function checkAuth() {
        try {
            if (localStorage.getItem('isLoggedIn') !== 'true') {
                window.location.href = '/login';
                return false;
            }

            const response = await fetch('/api/admin/models', { // Use an existing simple GET endpoint
                method: 'GET',
                credentials: 'include'
            });
            
            // Check for redirects that might indicate auth issues
            if (response.redirected) {
                const redirectUrl = new URL(response.url);
                if (redirectUrl.pathname.includes('login') || 
                    !redirectUrl.pathname.includes('/api/admin')) {
                    console.log('Detected redirect to login page. Session likely expired.');
                    localStorage.removeItem('isLoggedIn');
                    window.location.href = '/login';
                    return false;
                }
            }

            if (!response.ok) {
                if (response.status === 401 || response.status === 403 || 
                    (response.status >= 300 && response.status < 400)) {
                    console.log(`User is not authorized. Auth check failed with status: ${response.status}. Redirecting to login page.`);
                    localStorage.removeItem('isLoggedIn');
                    window.location.href = '/login';
                }
                return false;
            }
            
            localStorage.setItem('isLoggedIn', 'true');
            authCheckingUI.classList.add('hidden');
            unauthorizedUI.classList.add('hidden');
            mainContentUI.classList.remove('hidden');
            return true;

        } catch (error) {
            console.error('Authorization check failed:', error);
            localStorage.removeItem('isLoggedIn');
            window.location.href = '/login';
            return false;
        }
    }

    // --- Initial Load ---
    async function initialLoad() {
        const isAuthorized = await checkAuth();
        if (!isAuthorized) {
            console.log('User is not authorized. Aborting initial load.');
            return;
        }

        try {
            const results = await Promise.allSettled([
                loadModels(),
                loadCategoryQuotas(),
                loadWorkerKeys()
            ]);

            // Check results for critical failures (models/quotas)
            if (results[0].status === 'rejected') {
                 console.error(`Initial load failed for models:`, results[0].reason);
                 showError('Failed to load essential model data. Please refresh.');
                 return;
            }
             if (results[1].status === 'rejected') {
                 console.error(`Initial load failed for category quotas:`, results[1].reason);
                 showError('Failed to load category quotas. Display might be incorrect.');
            }
             if (results[2].status === 'rejected') {
                 console.error(`Initial load failed for worker keys:`, results[2].reason);
            }

            await loadGeminiKeys();
            // After loading Gemini keys, try to load available Gemini models
            await loadGeminiAvailableModels();


        } catch (error) {
            console.error('Failed to load data:', error);
            showError('Failed to load data. Please refresh the page or try again later.');
        }

        // Add logout button functionality
        if (logoutButton) {
            logoutButton.addEventListener('click', async () => {
                showLoading();
                try {
                    localStorage.removeItem('isLoggedIn'); // Clear local login status
                    const response = await fetch('/api/logout', { method: 'POST', credentials: 'include' });
                    window.location.href = '/login';
                } catch (error) {
                    showError('Error during logout.');
                } finally {
                    hideLoading();
                }
            });
        }
    }

    function initDarkMode() {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark') {
            document.body.setAttribute('data-theme', 'dark');
            sunIcon.classList.add('hidden');
            moonIcon.classList.remove('hidden');
        } else {
            document.body.setAttribute('data-theme', 'light');
            sunIcon.classList.remove('hidden');
            moonIcon.classList.add('hidden');
        }

        darkModeToggle.addEventListener('click', () => {
            const currentTheme = document.body.getAttribute('data-theme');

            if (currentTheme === 'light') {
                document.body.setAttribute('data-theme', 'dark');
                localStorage.setItem('theme', 'dark');
                sunIcon.classList.add('hidden');
                moonIcon.classList.remove('hidden');
            } else {
                document.body.setAttribute('data-theme', 'light');
                localStorage.setItem('theme', 'light');
                moonIcon.classList.add('hidden');
                sunIcon.classList.remove('hidden');
            }
        });
    }

    function setupAuthRefresh() {
        const authCheckInterval = 5 * 60 * 1000;
        
        setInterval(async () => {
            console.log("Performing scheduled auth check...");
            try {
                const response = await fetch('/api/admin/models', {
                    method: 'GET',
                    credentials: 'include'
                });
                
                if (response.redirected) {
                    const redirectUrl = new URL(response.url);
                    if (redirectUrl.pathname.includes('login') || 
                        !redirectUrl.pathname.includes('/api/admin')) {
                        console.log('Session expired during scheduled check. Redirecting to login.');
                        localStorage.removeItem('isLoggedIn');
                        window.location.href = '/login';
                    }
                }
                
                if (!response.ok) {
                    if (response.status === 401 || response.status === 403 || 
                        (response.status >= 300 && response.status < 400)) {
                        console.log(`Auth check failed with status: ${response.status}. Redirecting to login.`);
                        localStorage.removeItem('isLoggedIn');
                        window.location.href = '/login';
                    }
                }
            } catch (error) {
                console.error('Scheduled auth check failed:', error);
            }
        }, authCheckInterval);
    }

    initialLoad();
    initDarkMode();
    setupAuthRefresh();
});
