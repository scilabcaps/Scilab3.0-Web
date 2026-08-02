/**
 * resources.js
 * Handles loading resources from database and managing resource display
 */

/**
 * Load resources from Supabase database
 * Based on schema: chemicals table and lab_assets table
 */
async function loadResourcesFromDatabase() {
    try {
        // Load chemicals from public.chemicals table
        const { data: chemicals, error: chemError } = await supabase
            .from('chemicals')
            .select('chemical_id, chemical_name, formula, stock_quantity, unit')
            .eq('is_deleted', false);

        if (chemError) throw chemError;

        // Load lab assets (equipment and glassware) from public.lab_assets table
        const { data: assets, error: assetError } = await supabase
            .from('lab_assets')
            .select('asset_id, item_name, category, total_stock, available_stock, condition_notes')
            .eq('is_deleted', false);

        if (assetError) throw assetError;

        // Separate assets into equipment and glassware based on category
        const equipment = assets
            .filter(asset => asset.category === 'Equipment')
            .map(asset => ({
                id: asset.asset_id,
                name: asset.item_name,
                quantity: asset.available_stock,
                description: asset.condition_notes || ''
            }));

        const glassware = assets
            .filter(asset => asset.category === 'Glassware')
            .map(asset => ({
                id: asset.asset_id,
                name: asset.item_name,
                quantity: asset.available_stock,
                description: asset.condition_notes || ''
            }));

        // Map chemicals to the expected format
        const chemicalsFormatted = chemicals.map(chem => ({
            id: chem.chemical_id,
            name: chem.chemical_name,
            quantity: chem.stock_quantity,
            description: `${chem.formula} - ${chem.unit}`
        }));

        return {
            chemicals: chemicalsFormatted,
            equipment: equipment,
            glassware: glassware
        };
    } catch (error) {
        console.error('Error loading resources from Supabase:', error);
        return { chemicals: [], equipment: [], glassware: [] };
    }
}

/**
 * Load professors from Supabase
 * Based on schema: user_info table with role = 'professor'
 */
async function loadProfessorsFromSupabase() {
    try {
        // Try both lowercase and capitalized 'professor'
        const { data: professors, error } = await supabase
            .from('user_info')
            .select('id, first_name, last_name, role')
            .or('role.eq.professor,role.eq.Professor')
            .eq('is_banned', false);

        console.log('Professors query result:', professors, error);

        if (error) throw error;

        if (!professors || professors.length === 0) {
            console.warn('No professors found in database');
            return [];
        }

        return professors.map(prof => ({
            id: prof.id,
            name: `${prof.first_name} ${prof.last_name}`
        }));
    } catch (error) {
        console.error('Error loading professors from Supabase:', error);
        return [];
    }
}

/**
 * Submit reservation to Supabase
 * Based on schema: reservations and reservation_items tables
 */
async function submitReservationToSupabase(formData, cart) {
    try {
        // Insert into reservations table
        const { data: reservation, error: reservationError } = await supabase
            .from('reservations')
            .insert({
                user_id: formData.userId,
                reservation_date: formData.date,
                start_time: formData.startTime,
                end_time: formData.endTime,
                year_section: formData.yearSection,
                course: formData.course,
                professor: formData.professor,
                status: 'Pending',
                professor_approval: 'Pending',
                admin_approval: 'Pending'
            })
            .select()
            .single();

        if (reservationError) throw reservationError;

        // Insert reservation items for equipment and glassware
        const assetItems = formData.resources.filter(r => r.type === 'equipment' || r.type === 'glassware');
        if (assetItems.length > 0) {
            const reservationItems = assetItems.map(item => ({
                reservation_id: reservation.reservation_id,
                asset_id: item.id,
                quantity_borrowed: item.quantity,
                quantity_returned: 0,
                is_returned: false
            }));

            const { error: itemsError } = await supabase
                .from('reservation_items')
                .insert(reservationItems);

            if (itemsError) throw itemsError;
            
            // Update available stock in lab_assets
            for (const item of assetItems) {
                const { data: currentAsset, error: fetchError } = await supabase
                    .from('lab_assets')
                    .select('available_stock')
                    .eq('asset_id', item.id)
                    .single();
                
                if (!fetchError && currentAsset) {
                    const newStock = currentAsset.available_stock - item.quantity;
                    const { error: stockError } = await supabase
                        .from('lab_assets')
                        .update({ available_stock: newStock })
                        .eq('asset_id', item.id);
                    
                    if (stockError) {
                        console.error('Error updating stock:', stockError);
                    }
                }
            }
        }

        // Insert chemical usage for chemicals
        const chemicalItems = formData.resources.filter(r => r.type === 'chemicals');
        if (chemicalItems.length > 0) {
            const chemicalUsage = chemicalItems.map(item => ({
                reservation_id: reservation.reservation_id,
                chemical_id: item.id,
                quantity_used: item.quantity,
                purpose: 'Laboratory use'
            }));

            const { error: chemUsageError } = await supabase
                .from('chemical_usage')
                .insert(chemicalUsage);

            if (chemUsageError) throw chemUsageError;
            
            // Update stock quantity in chemicals
            for (const item of chemicalItems) {
                const { data: currentChemical, error: fetchChemicalError } = await supabase
                    .from('chemicals')
                    .select('stock_quantity')
                    .eq('chemical_id', item.id)
                    .single();
                
                if (!fetchChemicalError && currentChemical) {
                    const newStock = currentChemical.stock_quantity - item.quantity;
                    const { error: chemicalStockError } = await supabase
                        .from('chemicals')
                        .update({ stock_quantity: newStock })
                        .eq('chemical_id', item.id);
                    
                    if (chemicalStockError) {
                        console.error('Error updating chemical stock:', chemicalStockError);
                    }
                }
            }
        }

        return { success: true, reservationId: reservation.reservation_id };
    } catch (error) {
        console.error('Error submitting reservation to Supabase:', error);
        return { success: false, message: error.message };
    }
}

/**
 * Render a resource category
 * Note: This function needs access to the cart variable, which is defined in the HTML file
 * The cart-aware rendering is handled in the HTML file's renderResources function
 */
function renderResources(type, resources) {
    const grid = document.getElementById(type + 'Grid');
    if (!grid) return;
    
    grid.innerHTML = resources.map(resource => `
        <div class="resource-card">
            <div class="resource-name">${escapeHtml(resource.name)}</div>
            <div class="resource-info">${escapeHtml(resource.description || '')}</div>
            <div class="resource-quantity">Available: ${resource.quantity}</div>
            <button class="add-to-cart-btn" onclick="addToCart(${resource.id}, '${escapeHtml(resource.name)}', '${type}', ${resource.quantity})" 
                    ${resource.quantity === 0 ? 'disabled' : ''}>
                Select
            </button>
        </div>
    `).join('');
}

/**
 * Escape HTML special characters for security
 */
function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}
