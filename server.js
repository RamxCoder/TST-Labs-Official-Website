const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());

// Serve static frontend files from a 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

// BillDesk Merchant Credentials (Replace with your actual keys)
const BILLDESK_CONFIG = {
  merchantId: 'YOUR_MERCHANT_ID',
  clientId: 'YOUR_CLIENT_ID',
  secretKey: 'YOUR_HMAC_SECRET_KEY',
  gatewayUrl: 'https://uat1.billdesk.com/u2/payments/ve1_2/orders/create', // Use production URL when live
  returnUrl: 'http://localhost:3000/api/payment-return'
};

// In-memory user database simulation
let userDatabase = {
  hasPaid: false
};

// 1. Check User Access Endpoint
app.get('/api/get-user-profile', (req, res) => {
  res.json({ hasPaid: userDatabase.hasPaid });
});

// 2. Create Order & Generate BillDesk Checksum / Payload Endpoint
app.post('/api/create-billdesk-order', async (req, res) => {
  try {
    const { amount } = req.body;
    const orderId = 'TST' + Date.now();
    const orderDate = new Date().toISOString().split('.')[0] + '+05:30';

    const orderPayload = {
      mercid: BILLDESK_CONFIG.merchantId,
      orderid: orderId,
      amount: amount || "100.00",
      order_date: orderDate,
      currency: "356",
      ru: BILLDESK_CONFIG.returnUrl,
      itemcode: "DIRECT",
      additional_info: {
        additional_info1: "Melto Run Access",
        additional_info2: "NA",
        additional_info3: "NA",
        additional_info4: "NA",
        additional_info5: "NA",
        additional_info6: "NA",
        additional_info7: "NA"
      }
    };

    const dataString = JSON.stringify(orderPayload);
    const signature = crypto
      .createHmac('sha256', BILLDESK_CONFIG.secretKey)
      .update(dataString)
      .digest('hex');

    res.json({
      success: true,
      gatewayUrl: BILLDESK_CONFIG.gatewayUrl,
      orderId: orderId,
      msg: signature
    });

  } catch (error) {
    console.error("Order creation error:", error);
    res.status(500).json({ success: false, error: "Internal Server Error" });
  }
});

// 3. Return URL & Response Verification Endpoint
app.post('/api/payment-return', (req, res) => {
  try {
    const responsePayload = req.body; 

    const receivedChecksum = responsePayload.checksum || responsePayload.signature;
    delete responsePayload.checksum;
    delete responsePayload.signature;

    const computedChecksum = crypto
      .createHmac('sha256', BILLDESK_CONFIG.secretKey)
      .update(JSON.stringify(responsePayload))
      .digest('hex');

    if (computedChecksum === receivedChecksum) {
      const authStatus = responsePayload.auth_status;
      
      if (authStatus === '0300') {
        userDatabase.hasPaid = true;
        console.log(`Payment Verified & Successful for Order: ${responsePayload.orderid}`);
        return res.redirect('/?payment=success');
      } else {
        console.warn(`Payment Failed or Dropped with Status: ${authStatus}`);
        return res.redirect('/?payment=failed');
      }
    } else {
      console.error("SECURITY ALERT: Checksum mismatch on payment return URL!");
      return res.status(400).send("Security Verification Failed: Invalid Checksum Signature.");
    }

  } catch (error) {
    console.error("Return validation error:", error);
    res.status(500).send("Error validating payment response.");
  }
});

app.listen(PORT, () => {
  console.log(`TST Labs Server running at http://localhost:${PORT}`);
});
