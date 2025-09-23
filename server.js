// === 1. LOAD SECRETS (MUST BE FIRST) ===
require('dotenv').config();

// === 2. IMPORT DEPENDENCIES ===
const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY); // Your rk_... key
const app = express();

const PORT = 4242;

// --- CHECKOUT ENDPOINT ---
// This is what your frontend will eventually call
app.post('/create-checkout-session', async (req, res) => {
    console.log('Request received to create checkout session...');
    
    // This is placeholder data. You'll get this from your real app.
    const internalUserId = 'user-id-from-your-db-123';
    const internalProductId = 'my-product-tier-1';

    try {
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price: 'YOUR_PRICE_ID_HERE', // <-- ⚠️ REPLACE THIS
                quantity: 1,
            }],
            mode: 'payment',
            success_url: 'http://localhost:3000/success', // Placeholder
            cancel_url: 'http://localhost:3000/cancel',  // Placeholder

            // --- THE METADATA EXPLOIT ---
            metadata: {
                internal_user_id: internalUserId,
                internal_product_id: internalProductId
            }
        });

        res.json({ url: session.url });
        console.log('Checkout session created successfully.');

    } catch (e) {
        console.error('ERROR creating session:', e.message);
        res.status(500).json({ error: e.message });
    }
});


// --- WEBHOOK ENDPOINT (THE "NERVOUS SYSTEM") ---
// This is what Stripe calls *after* a payment
// CRITICAL: This must come *before* app.listen()
// This uses express.raw() to get the raw body, which Stripe *requires* for verification
app.post('/stripe-webhook', express.raw({type: 'application/json'}), (req, res) => {
    console.log('Webhook event received...');
    
    const sig = req.headers['stripe-signature'];
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET; // Your whsec_... key
    let event;

    try {
        // 1. Verify the event came from Stripe (the "Firewall")
        event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
        console.log(`⚠️ Webhook signature verification failed:`, err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // 2. Handle the verified event
    switch (event.type) {
        case 'checkout.session.completed':
            const session = event.data.object;
            
            // --- THE PAYLOAD RETRIEVAL ---
            const metadata = session.metadata;
            const userId = metadata.internal_user_id;
            const productId = metadata.internal_product_id;

            console.log('✅ PAYMENT SUCCESSFUL!');
            console.log(`🔥 PROVISIONING ACCESS for User ${userId} for Product ${productId}`);
            
            // --- YOUR PROVISIONING LOGIC GOES HERE ---
            // e.g., database.updateUserAccess(userId, productId)
            
            break;
        
        // ... handle other event types if needed
        
        default:
            console.log(`Unhandled event type ${event.type}`);
    }

    // 3. Send 200 OK back to Stripe
    res.status(200).send();
});


// === 3. START THE SERVER ===
app.listen(PORT, () => console.log(`🔥 Server running on http://localhost:${PORT}`));
