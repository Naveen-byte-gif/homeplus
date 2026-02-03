const PDFDocument = require('pdfkit');
const { cloudinary } = require('../config/cloudinary');

// Generate Invoice PDF
const generateInvoicePdf = async (invoice, user) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', async () => {
        try {
          const pdfBuffer = Buffer.concat(buffers);
          
          // Upload to Cloudinary
          const uploadResult = await new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
              {
                folder: 'apartment_sync/invoices',
                resource_type: 'raw',
                public_id: `invoice-${invoice.invoiceNumber}`
              },
              (error, result) => {
                if (error) reject(error);
                else resolve(result);
              }
            );
            uploadStream.end(pdfBuffer);
          });

          resolve({
            buffer: pdfBuffer,
            url: uploadResult.secure_url,
            publicId: uploadResult.public_id
          });
        } catch (error) {
          reject(error);
        }
      });

      // Header
      doc.fontSize(20).text('INVOICE', { align: 'center' });
      doc.moveDown();

      // Invoice details
      doc.fontSize(12);
      doc.text(`Invoice Number: ${invoice.invoiceNumber}`, { align: 'left' });
      doc.text(`Date: ${new Date(invoice.createdAt).toLocaleDateString('en-IN')}`, { align: 'left' });
      doc.text(`Due Date: ${new Date(invoice.dueDate).toLocaleDateString('en-IN')}`, { align: 'left' });
      doc.moveDown();

      // Billing period
      doc.text(`Billing Period: ${new Date(invoice.billingPeriod.startDate).toLocaleDateString('en-IN')} to ${new Date(invoice.billingPeriod.endDate).toLocaleDateString('en-IN')}`, { align: 'left' });
      doc.moveDown();

      // Bill To
      doc.fontSize(14).text('Bill To:', { underline: true });
      doc.fontSize(12);
      doc.text(user.fullName || 'Resident');
      doc.text(`Flat: ${invoice.flatNumber}, ${invoice.building}`);
      doc.text(`Floor: ${invoice.floor}`);
      doc.moveDown();

      // Items table
      doc.fontSize(14).text('Items:', { underline: true });
      doc.moveDown(0.5);

      // Table header
      doc.fontSize(10);
      doc.text('Description', 50, doc.y);
      doc.text('Amount (₹)', 450, doc.y, { align: 'right' });
      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(0.5);

      // Items
      invoice.items.forEach(item => {
        doc.text(item.name || item.description || 'Item', 50, doc.y);
        doc.text(`₹${item.amount.toFixed(2)}`, 450, doc.y, { align: 'right' });
        doc.moveDown(0.5);
      });

      doc.moveDown();
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(0.5);

      // Totals
      doc.fontSize(12);
      doc.text('Subtotal:', 350, doc.y);
      doc.text(`₹${invoice.totalAmount.toFixed(2)}`, 450, doc.y, { align: 'right' });
      doc.moveDown(0.5);

      if (invoice.previousDues > 0) {
        doc.text('Previous Dues:', 350, doc.y);
        doc.text(`₹${invoice.previousDues.toFixed(2)}`, 450, doc.y, { align: 'right' });
        doc.moveDown(0.5);
      }

      if (invoice.lateFee > 0) {
        doc.text('Late Fee:', 350, doc.y);
        doc.text(`₹${invoice.lateFee.toFixed(2)}`, 450, doc.y, { align: 'right' });
        doc.moveDown(0.5);
      }

      doc.fontSize(14).font('Helvetica-Bold');
      doc.text('Total Payable:', 350, doc.y);
      doc.text(`₹${invoice.totalPayable.toFixed(2)}`, 450, doc.y, { align: 'right' });
      doc.moveDown();

      // Payment status
      doc.fontSize(12).font('Helvetica');
      doc.text(`Status: ${invoice.status.toUpperCase()}`, { align: 'left' });
      if (invoice.paidAmount > 0) {
        doc.text(`Paid: ₹${invoice.paidAmount.toFixed(2)}`, { align: 'left' });
        doc.text(`Outstanding: ₹${invoice.outstandingAmount.toFixed(2)}`, { align: 'left' });
      }

      // Notes
      if (invoice.notes) {
        doc.moveDown();
        doc.fontSize(10).text(`Notes: ${invoice.notes}`, { align: 'left' });
      }

      // Footer
      doc.fontSize(8);
      doc.text('This is a computer-generated invoice.', 50, doc.page.height - 50, { align: 'center' });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

// Generate Receipt PDF
const generateReceiptPdf = async (payment, invoice, user) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', async () => {
        try {
          const pdfBuffer = Buffer.concat(buffers);
          
          // Upload to Cloudinary
          const uploadResult = await new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
              {
                folder: 'apartment_sync/receipts',
                resource_type: 'raw',
                public_id: `receipt-${payment.receiptNumber}`
              },
              (error, result) => {
                if (error) reject(error);
                else resolve(result);
              }
            );
            uploadStream.end(pdfBuffer);
          });

          resolve({
            buffer: pdfBuffer,
            url: uploadResult.secure_url,
            publicId: uploadResult.public_id
          });
        } catch (error) {
          reject(error);
        }
      });

      // Header
      doc.fontSize(20).text('PAYMENT RECEIPT', { align: 'center' });
      doc.moveDown();

      // Receipt details
      doc.fontSize(12);
      doc.text(`Receipt Number: ${payment.receiptNumber}`, { align: 'left' });
      doc.text(`Date: ${new Date(payment.paymentDate).toLocaleDateString('en-IN')}`, { align: 'left' });
      doc.text(`Status: ${payment.status.toUpperCase()}`, { align: 'left' });
      doc.moveDown();

      // Paid To
      doc.fontSize(14).text('Paid To:', { underline: true });
      doc.fontSize(12);
      doc.text(user.fullName || 'Resident');
      doc.text(`Flat: ${invoice.flatNumber}, ${invoice.building}`);
      doc.moveDown();

      // Payment details
      doc.fontSize(14).text('Payment Details:', { underline: true });
      doc.fontSize(12);
      doc.text(`Invoice Number: ${invoice.invoiceNumber}`);
      doc.text(`Payment Purpose: ${payment.paymentPurpose}`);
      doc.text(`Amount: ₹${payment.amount.toFixed(2)}`);
      
      if (payment.upiReferenceId) {
        doc.text(`UPI Reference ID: ${payment.upiReferenceId}`);
      }
      
      if (payment.transactionNote) {
        doc.text(`Transaction Note: ${payment.transactionNote}`);
      }
      doc.moveDown();

      // Description
      if (payment.description) {
        doc.fontSize(12).text(`Description: ${payment.description}`, { align: 'left' });
        doc.moveDown();
      }

      // Verification details
      if (payment.status === 'approved' && payment.verifiedBy) {
        doc.fontSize(10);
        doc.text(`Verified by: ${payment.verifiedBy.fullName || 'Admin'}`, { align: 'left' });
        doc.text(`Verified at: ${new Date(payment.verifiedAt).toLocaleString('en-IN')}`, { align: 'left' });
      }

      // Footer
      doc.fontSize(8);
      doc.text('This is a computer-generated receipt.', 50, doc.page.height - 50, { align: 'center' });

      doc.end();
    } catch (error) {
      reject(error);
    }
  });
};

module.exports = {
  generateInvoicePdf,
  generateReceiptPdf
};

