const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const path = require('path');

// Email transporter configuration
const createTransporter = () => {
  return nodemailer.createTransporter({
    service: process.env.EMAIL_SERVICE || 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
};

// Email templates
const EMAIL_TEMPLATES = {
  WELCOME: 'welcome',
  COMPLAINT_REGISTERED: 'complaint_registered',
  COMPLAINT_STATUS_UPDATE: 'complaint_status_update',
  COMPLAINT_RESOLVED: 'complaint_resolved',
  NOTICE_PUBLISHED: 'notice_published',
  PAYMENT_REMINDER: 'payment_reminder',
  ACCOUNT_APPROVED: 'account_approved',
  ACCOUNT_REJECTED: 'account_rejected',
  PASSWORD_RESET: 'password_reset',
  SECURITY_ALERT: 'security_alert'
};

// Load email template
const loadEmailTemplate = async (templateName, variables = {}) => {
  try {
    const templatePath = path.join(__dirname, '../templates/emails', `${templateName}.html`);
    let template = await fs.readFile(templatePath, 'utf8');
    
    // Add common variables
    const allVariables = {
      ...variables,
      currentYear: new Date().getFullYear(),
      supportEmail: process.env.SUPPORT_EMAIL || 'support@apartmentsync.com',
      frontendUrl: process.env.FRONTEND_URL || 'https://apartmentsync.com',
    };
    
    // Replace variables in template (handle both {{var}} and {{#if var}}...{{/if}} patterns)
    Object.keys(allVariables).forEach(key => {
      const value = allVariables[key] || '';
      // Replace simple variables
      const regex = new RegExp(`{{${key}}}`, 'g');
      template = template.replace(regex, String(value));
      
      // Handle if conditions (simple implementation)
      const ifRegex = new RegExp(`{{#if ${key}}}([\\s\\S]*?){{/if}}`, 'g');
      template = template.replace(ifRegex, (match, content) => {
        return value ? content : '';
      });
    });
    
    // Clean up any remaining unreplaced variables
    template = template.replace(/{{[^}]+}}/g, '');
    
    return template;
  } catch (error) {
    console.error(`Error loading email template ${templateName}:`, error);
    
    // Fallback to basic template
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #4F46E5; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .footer { padding: 20px; text-align: center; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>ApartmentSync</h1>
          </div>
          <div class="content">
            ${variables.content || 'This is an automated message from ApartmentSync.'}
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} ApartmentSync. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
};

// Send email
const sendEmail = async (to, subject, html, attachments = []) => {
  try {
    // Don't send emails in test environment
    if (process.env.NODE_ENV === 'test') {
      console.log(`📧 [TEST] Email would be sent to: ${to}`);
      console.log(`📧 [TEST] Subject: ${subject}`);
      return { success: true, message: 'Email logged (test environment)' };
    }

    const transporter = createTransporter();
    
    const mailOptions = {
      from: `ApartmentSync <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
      attachments
    };

    const result = await transporter.sendMail(mailOptions);
    console.log(`✅ Email sent to ${to}: ${result.messageId}`);
    
    return { 
      success: true, 
      message: 'Email sent successfully',
      messageId: result.messageId 
    };

  } catch (error) {
    console.error('❌ Email sending error:', error);
    return { 
      success: false, 
      message: 'Failed to send email',
      error: error.message 
    };
  }
};

// Send welcome email to new user
const sendWelcomeEmail = async (user) => {
  const templateVars = {
    fullName: user.fullName,
    apartmentCode: user.apartmentCode,
    wing: user.wing,
    flatNumber: user.flatNumber,
    loginUrl: `${process.env.FRONTEND_URL}/login`
  };

  const html = await loadEmailTemplate(EMAIL_TEMPLATES.WELCOME, templateVars);
  
  return await sendEmail(
    user.email,
    'Welcome to ApartmentSync - Your Account is Under Review',
    html
  );
};

// Send complaint registered email
const sendComplaintRegisteredEmail = async (user, complaint) => {
  const templateVars = {
    fullName: user.fullName,
    ticketNumber: complaint.ticketNumber,
    title: complaint.title,
    category: complaint.category,
    priority: complaint.priority,
    complaintUrl: `${process.env.FRONTEND_URL}/complaints/${complaint._id}`,
    supportEmail: process.env.SUPPORT_EMAIL || 'support@apartmentsync.com'
  };

  const html = await loadEmailTemplate(EMAIL_TEMPLATES.COMPLAINT_REGISTERED, templateVars);
  
  return await sendEmail(
    user.email,
    `Complaint Registered - ${complaint.ticketNumber}`,
    html
  );
};

// Send complaint status update email
const sendComplaintStatusUpdateEmail = async (user, complaint, oldStatus, newStatus) => {
  const templateVars = {
    fullName: user.fullName,
    ticketNumber: complaint.ticketNumber,
    title: complaint.title,
    oldStatus,
    newStatus,
    complaintUrl: `${process.env.FRONTEND_URL}/complaints/${complaint._id}`,
    updatedAt: new Date().toLocaleString()
  };

  const html = await loadEmailTemplate(EMAIL_TEMPLATES.COMPLAINT_STATUS_UPDATE, templateVars);
  
  return await sendEmail(
    user.email,
    `Complaint Status Updated - ${complaint.ticketNumber}`,
    html
  );
};

// Send complaint resolved email
const sendComplaintResolvedEmail = async (user, complaint) => {
  const templateVars = {
    fullName: user.fullName,
    ticketNumber: complaint.ticketNumber,
    title: complaint.title,
    resolvedAt: complaint.resolution?.resolvedAt 
      ? new Date(complaint.resolution.resolvedAt).toLocaleString()
      : new Date().toLocaleString(),
    resolutionDescription: complaint.resolution?.description || 'Issue has been resolved',
    complaintUrl: `${process.env.FRONTEND_URL || 'https://apartmentsync.com'}/complaints/${complaint._id}`,
    ratingUrl: `${process.env.FRONTEND_URL || 'https://apartmentsync.com'}/complaints/${complaint._id}/rate`
  };

  const html = await loadEmailTemplate(EMAIL_TEMPLATES.COMPLAINT_RESOLVED, templateVars);
  
  return await sendEmail(
    user.email,
    `Complaint Resolved - ${complaint.ticketNumber}`,
    html
  );
};

// Send notice published email
const sendNoticePublishedEmail = async (users, notice) => {
  const templateVars = {
    title: notice.title,
    content: notice.content.substring(0, 200) + (notice.content.length > 200 ? '...' : ''),
    category: notice.category,
    priority: notice.priority,
    publishedBy: notice.createdBy.fullName,
    noticeUrl: `${process.env.FRONTEND_URL}/notices/${notice._id}`,
    effectiveDate: notice.schedule.publishAt.toLocaleString()
  };

  const html = await loadEmailTemplate(EMAIL_TEMPLATES.NOTICE_PUBLISHED, templateVars);
  
  // Send to multiple users
  const emailPromises = users.map(user => 
    sendEmail(user.email, `New Notice: ${notice.title}`, html)
  );
  
  return await Promise.allSettled(emailPromises);
};

// Send payment reminder email
const sendPaymentReminderEmail = async (user, invoice) => {
  const templateVars = {
    fullName: user.fullName,
    invoiceNumber: invoice.invoiceNumber,
    amount: invoice.totalAmount,
    dueDate: invoice.dueDate.toLocaleDateString(),
    paymentUrl: `${process.env.FRONTEND_URL}/payments/${invoice._id}`,
    lateFee: invoice.lateFee || 0
  };

  const html = await loadEmailTemplate(EMAIL_TEMPLATES.PAYMENT_REMINDER, templateVars);
  
  return await sendEmail(
    user.email,
    `Payment Reminder - Invoice ${invoice.invoiceNumber}`,
    html
  );
};

// Send account approved email
const sendAccountApprovedEmail = async (user) => {
  const templateVars = {
    fullName: user.fullName,
    apartmentCode: user.apartmentCode,
    wing: user.wing,
    flatNumber: user.flatNumber,
    loginUrl: `${process.env.FRONTEND_URL}/login`,
    supportEmail: process.env.SUPPORT_EMAIL || 'support@apartmentsync.com'
  };

  const html = await loadEmailTemplate(EMAIL_TEMPLATES.ACCOUNT_APPROVED, templateVars);
  
  return await sendEmail(
    user.email,
    'Your ApartmentSync Account Has Been Approved',
    html
  );
};

// Send account rejected email
const sendAccountRejectedEmail = async (user, reason) => {
  const templateVars = {
    fullName: user.fullName,
    reason: reason || 'Please contact the apartment administration for more details.',
    contactEmail: process.env.ADMIN_EMAIL || 'admin@apartmentsync.com',
    supportPhone: process.env.SUPPORT_PHONE || '+91-XXXXXX-XXXX'
  };

  const html = await loadEmailTemplate(EMAIL_TEMPLATES.ACCOUNT_REJECTED, templateVars);
  
  return await sendEmail(
    user.email,
    'ApartmentSync Account Registration Update',
    html
  );
};

// Send password reset email
const sendPasswordResetEmail = async (user, resetToken) => {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
  
  const templateVars = {
    fullName: user.fullName,
    resetUrl,
    expiryTime: '1 hour', // Token expiry time
    supportEmail: process.env.SUPPORT_EMAIL || 'support@apartmentsync.com'
  };

  const html = await loadEmailTemplate(EMAIL_TEMPLATES.PASSWORD_RESET, templateVars);
  
  return await sendEmail(
    user.email,
    'Password Reset Request - ApartmentSync',
    html
  );
};

// Send security alert email
const sendSecurityAlertEmail = async (user, alertType, metadata = {}) => {
  const templateVars = {
    fullName: user.fullName,
    alertType,
    timestamp: new Date().toLocaleString(),
    device: metadata.device || 'Unknown device',
    location: metadata.location || 'Unknown location',
    supportEmail: process.env.SUPPORT_EMAIL || 'support@apartmentsync.com',
    changePasswordUrl: `${process.env.FRONTEND_URL}/change-password`
  };

  const html = await loadEmailTemplate(EMAIL_TEMPLATES.SECURITY_ALERT, templateVars);
  
  return await sendEmail(
    user.email,
    'Security Alert - ApartmentSync',
    html
  );
};

// Send bulk email to multiple users
const sendBulkEmail = async (users, subject, content, attachments = []) => {
  const templateVars = {
    content,
    currentYear: new Date().getFullYear()
  };

  const html = await loadEmailTemplate('bulk', templateVars);
  
  const emailPromises = users.map(user => 
    sendEmail(user.email, subject, html, attachments)
  );
  
  const results = await Promise.allSettled(emailPromises);
  
  // Return summary
  const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
  const failed = results.filter(r => r.status === 'rejected' || !r.value.success).length;
  
  return {
    total: users.length,
    successful,
    failed,
    results: results.map((r, index) => ({
      user: users[index].email,
      status: r.status === 'fulfilled' ? (r.value.success ? 'success' : 'failed') : 'failed',
      error: r.status === 'rejected' ? r.reason : (r.value.error || null)
    }))
  };
};

// Email scheduling service
class EmailScheduler {
  constructor() {
    this.scheduledEmails = new Map();
  }

  // Schedule an email for later delivery
  scheduleEmail(deliveryTime, emailData) {
    const jobId = `email_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const now = new Date().getTime();
    const deliveryTimestamp = new Date(deliveryTime).getTime();
    const delay = Math.max(0, deliveryTimestamp - now);

    const timeoutId = setTimeout(async () => {
      try {
        await sendEmail(
          emailData.to,
          emailData.subject,
          emailData.html,
          emailData.attachments
        );
        this.scheduledEmails.delete(jobId);
      } catch (error) {
        console.error(`Scheduled email failed for job ${jobId}:`, error);
      }
    }, delay);

    this.scheduledEmails.set(jobId, {
      timeoutId,
      emailData,
      scheduledFor: deliveryTime,
      status: 'scheduled'
    });

    return jobId;
  }

  // Cancel a scheduled email
  cancelScheduledEmail(jobId) {
    const job = this.scheduledEmails.get(jobId);
    if (job) {
      clearTimeout(job.timeoutId);
      this.scheduledEmails.delete(jobId);
      return true;
    }
    return false;
  }

  // Get all scheduled emails
  getScheduledEmails() {
    return Array.from(this.scheduledEmails.entries()).map(([id, job]) => ({
      id,
      ...job
    }));
  }
}

// Create email scheduler instance
const emailScheduler = new EmailScheduler();

module.exports = {
  sendEmail,
  sendWelcomeEmail,
  sendComplaintRegisteredEmail,
  sendComplaintStatusUpdateEmail,
  sendComplaintResolvedEmail,
  sendNoticePublishedEmail,
  sendPaymentReminderEmail,
  sendAccountApprovedEmail,
  sendAccountRejectedEmail,
  sendPasswordResetEmail,
  sendSecurityAlertEmail,
  sendBulkEmail,
  emailScheduler,
  EMAIL_TEMPLATES
};