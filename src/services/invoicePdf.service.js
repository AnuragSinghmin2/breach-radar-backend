const PDFDocument = require('pdfkit');

class InvoicePdfService {
  /**
   * Generates a PDF stream/buffer for a given invoice.
   * @param {Object} invoice - Invoice document from DB
   * @param {Object} user - User document
   * @param {Object} organization - Organization document
   * @returns {Promise<Buffer>} - Buffer of the compiled PDF
   */
  generateInvoicePdf(invoice, user, organization) {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const chunks = [];

        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', (err) => reject(err));

        const formatMoney = (amount) => {
          return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: invoice.currency || 'INR',
            maximumFractionDigits: 0
          }).format(amount || 0);
        };

        const formatDate = (date) => {
          return new Intl.DateTimeFormat('en-IN', {
            day: '2-digit',
            month: 'long',
            year: 'numeric'
          }).format(new Date(date));
        };

        // 1. Header (Branding & Title)
        doc.fillColor('#00d68f')
          .fontSize(24)
          .font('Helvetica-Bold')
          .text('BREACH RADAR', 50, 50);

        doc.fillColor('#94a3b8')
          .fontSize(10)
          .font('Helvetica')
          .text('Securing Domains, Scans, and Infrastructures', 50, 78);

        doc.fillColor('#f8fafc')
          .fontSize(18)
          .font('Helvetica-Bold')
          .text('INVOICE', 400, 50, { align: 'right' });

        // Line divider
        doc.moveTo(50, 105)
          .lineTo(545, 105)
          .strokeColor('#334155')
          .lineWidth(1)
          .stroke();

        // 2. Billing Info (Metadata Grid)
        doc.fillColor('#f8fafc')
          .fontSize(11)
          .font('Helvetica-Bold')
          .text('Invoice Details:', 50, 125);

        doc.fillColor('#94a3b8')
          .font('Helvetica')
          .text(`Invoice Number: `, 50, 145)
          .fillColor('#f8fafc')
          .text(invoice.invoiceNumber, 150, 145);

        doc.fillColor('#94a3b8')
          .text(`Date of Issue: `, 50, 160)
          .fillColor('#f8fafc')
          .text(formatDate(invoice.generatedAt || invoice.createdAt), 150, 160);

        doc.fillColor('#94a3b8')
          .text(`Payment Status: `, 50, 175)
          .fillColor('#00d68f')
          .text(String(invoice.paymentStatus).toUpperCase(), 150, 175);

        doc.fillColor('#94a3b8')
          .text(`Transaction ID: `, 50, 190)
          .fillColor('#f8fafc')
          .text(invoice.transactionId || 'N/A', 150, 190);

        // Bill To section
        doc.fillColor('#f8fafc')
          .fontSize(11)
          .font('Helvetica-Bold')
          .text('Billed To:', 320, 125);

        doc.fillColor('#f8fafc')
          .font('Helvetica')
          .text(organization.name || 'Personal Account', 320, 145);

        doc.fillColor('#94a3b8')
          .text(user.profile?.name || 'Authorized Member', 320, 160)
          .text(user.email, 320, 175);

        // Line divider
        doc.moveTo(50, 220)
          .lineTo(545, 220)
          .strokeColor('#334155')
          .stroke();

        // 3. Itemized Table
        doc.fillColor('#f8fafc')
          .fontSize(11)
          .font('Helvetica-Bold')
          .text('Subscription Description', 50, 245)
          .text('Qty', 350, 245, { width: 50, align: 'right' })
          .text('Rate', 410, 245, { width: 60, align: 'right' })
          .text('Amount', 480, 245, { width: 65, align: 'right' });

        // Line divider
        doc.moveTo(50, 262)
          .lineTo(545, 262)
          .strokeColor('#475569')
          .lineWidth(1)
          .stroke();

        // Invoice Item Details
        const planDisplay = `${invoice.planName} Plan Subscription`;
        doc.fillColor('#e2e8f0')
          .fontSize(10)
          .font('Helvetica')
          .text(planDisplay, 50, 280, { width: 280 })
          .text('1', 350, 280, { width: 50, align: 'right' })
          .text(formatMoney(invoice.amount), 410, 280, { width: 60, align: 'right' })
          .text(formatMoney(invoice.amount), 480, 280, { width: 65, align: 'right' });

        // Line divider
        doc.moveTo(50, 310)
          .lineTo(545, 310)
          .strokeColor('#334155')
          .stroke();

        // 4. Totals Block
        const totalsY = 330;
        doc.fillColor('#94a3b8')
          .fontSize(10)
          .text('Subtotal:', 350, totalsY, { width: 100, align: 'right' })
          .fillColor('#f8fafc')
          .text(formatMoney(invoice.amount), 460, totalsY, { width: 85, align: 'right' });

        doc.fillColor('#94a3b8')
          .text('GST / Tax (0%):', 350, totalsY + 15, { width: 100, align: 'right' })
          .fillColor('#f8fafc')
          .text(formatMoney(invoice.tax || 0), 460, totalsY + 15, { width: 85, align: 'right' });

        // Final Total Box
        doc.moveTo(350, totalsY + 35)
          .lineTo(545, totalsY + 35)
          .strokeColor('#334155')
          .stroke();

        doc.fillColor('#00d68f')
          .fontSize(12)
          .font('Helvetica-Bold')
          .text('Total Paid:', 350, totalsY + 45, { width: 100, align: 'right' })
          .text(formatMoney(invoice.amount + (invoice.tax || 0)), 460, totalsY + 45, { width: 85, align: 'right' });

        // 5. Footer Terms
        doc.fillColor('#94a3b8')
          .fontSize(9)
          .font('Helvetica-Oblique')
          .text('Invoices are generated automatically on subscription changes.', 50, 480, { align: 'center' })
          .text('For queries regarding billing or transactions, contact support@breachradar.com.', 50, 495, { align: 'center' });

        // Bottom Decorative Accent
        doc.rect(50, 520, 495, 3)
          .fill('#00d68f');

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }
}

module.exports = new InvoicePdfService();
