const express = require('express');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();

// Body parser middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static assets directly from the root directory (no public folder)
app.use(express.static(__dirname));

// =========================================================================
// 1. BILLDESK CONFIGURATION
// =========================================================================
const BILLDESK_CONFIG = {
  merchantId: process.env.BILLDESK_MERCHANT_ID || "TSTLABS",
  securityId: process.env.BILLDESK_SECURITY_ID || "tstlabs_sec",
  checksumKey: process.env.BILLDESK_CHECKSUM_KEY || "YOUR_ACTUAL_CHECKSUM_KEY",
  gatewayUrl: process.env.BILLDESK_GATEWAY_URL || "https://pgi.billdesk.com/pgidsk/PGIMerchantPayment"
};

// =========================================================================
// 2. NODEMAILER EMAIL RECEIPT CONFIGURATION
// =========================================================================
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'supermoniorunsupport@gmail.com',
    pass: process.env.EMAIL_PASS || 'YOUR_GMAIL_16_CHAR_APP_PASSWORD'
  }
});

async function sendReceiptEmail(buyerEmail, orderId, txnId) {
  const mailOptions = {
    from: '"TST Labs Support" <supermoniorunsupport@gmail.com>',
    to: buyerEmail,
    subject: 'Payment Receipt & Access Key - Melto Run: Online Multiplayer',
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; background-color: #0b0d14; color: #f0f4f8;">
        <h2 style="color: #00f0ff;">TST Labs - Purchase Confirmation</h2>
        <p>Thank you for buying <strong>Melto Run: Online Multiplayer</strong>!</p>
        <hr style="border-color: #00f0ff;" />
        <h3>Transaction Details:</h3>
        <ul>
          <li><strong>Order ID:</strong> ${orderId}</li>
          <li><strong>Transaction ID:</strong> ${txnId}</li>
          <li><strong>Amount Paid:</strong> ₹100.00</li>
          <li><strong>Fulfillment Status:</strong> Digital Key Issued</li>
        </ul>
        <h3>How to Play:</h3>
        <p>Access your digital game build directly at our official web portal:</p>
        <p><a href="https://super-monio-run-website2.vercel.app/" style="color: #ff5500; font-weight: bold;">Launch Melto Run</a></p>
        <br />
        <p>If you have any questions, reach out to us at <a href="mailto:supermoniorunsupport@gmail.com" style="color: #00f0ff;">supermoniorunsupport@gmail.com</a>.</p>
        <p style="font-size: 0.8rem; color: #8a99ad;">TST Labs | Near Shahu Engineering college, Sham Nagar, Buldhana</p>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Receipt email sent to ${buyerEmail} (saved in Sent folder).`);
  } catch (err) {
    console.error('Error sending receipt email:', err);
  }
}

// Memory cache to map order IDs to customer email addresses
const pendingOrders = {};

// =========================================================================
// 3. API ENDPOINTS & ROUTES
// =========================================================================

// Endpoint to generate BillDesk request string and HMAC checksum
app.post('/api/create-billdesk-order', (req, res) => {
  try {
    const { email } = req.body;
    const amount = "100.00";
    const customerId = "CUST-" + Math.floor(100000 + Math.random() * 900000);
    const orderId = "TST-" + Date.now();
    const returnUrl = `${req.protocol}://${req.get('host')}/api/billdesk-callback`;

    if (email) {
      pendingOrders[orderId] = email;
    }

    const messageParts = [
      BILLDESK_CONFIG.merchantId,
      customerId,
      "NA",
      amount,
      "NA",
      "NA",
      "NA",
      "INR",
      "NA",
      "R",
      BILLDESK_CONFIG.securityId,
      "NA",
      "NA",
      "F",
      orderId,
      "MeltoRun_Access",
      "NA",
      "NA",
      "NA",
      "NA",
      "NA",
      returnUrl
    ];

    const rawMessageString = messageParts.join('|');
    const hmac = crypto.createHmac('sha256', BILLDESK_CONFIG.checksumKey);
    hmac.update(rawMessageString);
    const checksum = hmac.digest('hex').toUpperCase();

    const finalMsgString = `${rawMessageString}\vert{}${checksum}`;

    res.json({
      success: true,
      gatewayUrl: BILLDESK_CONFIG.gatewayUrl,
      msg: finalMsgString
    });
  } catch (error) {
    console.error("Order Creation Error:", error);
    res.status(500).json({ success: false, error: "Payment initiation failed." });
  }
});

// BillDesk payment callback webhook endpoint
app.post('/api/billdesk-callback', async (req, res) => {
  const responseMsg = req.body.msg;
  if (!responseMsg) return res.redirect('/?status=failed');

  const parts = responseMsg.split('|');
  const responseCode = parts[14] || parts[15];
  const orderId = parts[1];
  const txnId = parts[2] || 'SUCCESS';

  if (responseCode === '0300' || req.body.status === 'success') {
    const buyerEmail = pendingOrders[orderId];
    if (buyerEmail) {
      await sendReceiptEmail(buyerEmail, orderId, txnId);
      delete pendingOrders[orderId];
    }
    res.redirect('/?status=success&txn=' + txnId);
  } else {
    res.redirect('/?status=failed');
  }
});

// Serve index.html directly from the root folder
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`TST Labs Server running at http://localhost:${PORT}`);
});