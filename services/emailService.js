const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const path = require('path');

// Email transporter configuration - Brevo SMTP (Production-Ready Setup)
const createTransporter = () => {
  // Validate Brevo configuration - Use SMTP credentials
  const brevoSMTPKey = process.env.BREVO_SMTP_KEY || process.env.BREVO_API_KEY || process.env.BREVO_SMTP_PASS;
  const brevoHost = process.env.BREVO_SMTP_HOST || 'smtp-relay.brevo.com';
  const brevoPort = parseInt(process.env.BREVO_SMTP_PORT) || 587;
  const brevoUser = process.env.BREVO_SMTP_USER || process.env.BREVO_SMTP_LOGIN;
  
  // Use Brevo SMTP if API key is configured
  if (brevoSMTPKey && brevoUser) {
    const transporter = nodemailer.createTransport({
      host: brevoHost,
      port: brevoPort,
      secure: false, // true for 465, false for other ports (587 uses STARTTLS)
      auth: {
        user: brevoUser,
        pass: brevoSMTPKey
      },
      tls: {
        // In production, set to true for proper certificate validation
        rejectUnauthorized: process.env.NODE_ENV === 'production'
      },
      // Connection timeout
      connectionTimeout: 10000, // 10 seconds
      // Greeting timeout
      greetingTimeout: 5000, // 5 seconds
      // Socket timeout
      socketTimeout: 10000 // 10 seconds
    });
    
    // Verify transporter configuration (async, don't wait)
    transporter.verify((error, success) => {
      if (error) {
        console.error('❌ [EMAIL] Brevo SMTP configuration error:', error.message);
      } else {
        console.log('✅ [EMAIL] Brevo SMTP transporter ready');
        console.log(`📧 [EMAIL] Brevo Host: ${brevoHost}:${brevoPort}`);
        console.log(`📧 [EMAIL] Brevo User: ${brevoUser}`);
      }
    });
    
    return transporter;
  }
  
  // Fallback to service-based configuration (for development/testing)
  console.warn('⚠️ [EMAIL] BREVO_SMTP_KEY and BREVO_SMTP_USER not found, using fallback email service');
  return nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
};

// Email templates
const EMAIL_TEMPLATES = {
  OTP: 'otp',
  WELCOME: 'welcome',
  ACCOUNT_CREATED: 'account_created',
  ADMIN_USER_CREATION_OTP: 'admin_user_creation_otp',
  ACCOUNT_CONFIRMATION: 'account_confirmation',
  ADMIN_NEW_USER_NOTIFICATION: 'admin_new_user_notification',
  USER_STATUS_CHANGE: 'user_status_change',
  COMPLAINT_REGISTERED: 'complaint_registered',
  ADMIN_NEW_COMPLAINT: 'admin_new_complaint',
  ADMIN_COMPLAINT_STATUS_CHANGE: 'admin_complaint_status_change',
  COMPLAINT_STATUS_UPDATE: 'complaint_status_update',
  COMPLAINT_RESOLVED: 'complaint_resolved',
  NOTICE_PUBLISHED: 'notice_published',
  PAYMENT_REMINDER: 'payment_reminder',
  ACCOUNT_APPROVED: 'account_approved',
  ACCOUNT_REJECTED: 'account_rejected',
  PASSWORD_RESET: 'password_reset',
  SECURITY_ALERT: 'security_alert',
  VISITOR_ENTRY: 'visitor_entry',
  VISITOR_CHECKIN: 'visitor_checkin',
  VISITOR_CHECKOUT: 'visitor_checkout',
  VISITOR_STATUS_UPDATE: 'visitor_status_update',
  STAFF_ONBOARDED: 'staff_onboarded',
  BUILDING_CREATED: 'building_created',
  ADMIN_WELCOME: 'admin_welcome',
  PASSWORD_CHANGED: 'password_changed'
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
const sendEmail = async (to, subject, html, attachments = [], text = null, fromEmail = null, fromName = null) => {
  try {
    // Validate inputs
    if (!to || !subject || (!html && !text)) {
      console.error('❌ [EMAIL] Missing required fields: to, subject, and html/text');
      return {
        success: false,
        message: 'Missing required fields: to, subject, and html/text'
      };
    }

    // Don't send emails in test environment
    if (process.env.NODE_ENV === 'test') {
      console.log(`📧 [TEST] Email would be sent to: ${to}`);
      console.log(`📧 [TEST] Subject: ${subject}`);
      return { success: true, message: 'Email logged (test environment)' };
    }

    const transporter = createTransporter();
    
    // Use default sender email for SMTP authentication
    // Note: Most SMTP services require 'from' to match authenticated email
    const defaultSenderEmail = process.env.SENDER_EMAIL || process.env.EMAIL_USER;
    if (!defaultSenderEmail) {
      console.error('❌ [EMAIL] SENDER_EMAIL not configured');
      return {
        success: false,
        message: 'Email sender not configured. Please set SENDER_EMAIL in environment variables.'
      };
    }
    
    // Use custom sender name if provided, otherwise use default
    const senderName = fromName || process.env.SENDER_NAME || 'ApartmentSync';
    
    // For 'from' field: Use default sender (required for SMTP auth)
    // For Reply-To: Use custom email if provided (building owner's email)
    const mailOptions = {
      from: `"${senderName}" <${defaultSenderEmail}>`,
      to: Array.isArray(to) ? to.join(', ') : to,
      subject,
      html: html || undefined,
      text: text || undefined,
      attachments: attachments || [],
      // Add Reply-To header if custom sender email is provided (for building owner emails)
      ...(fromEmail && fromEmail !== defaultSenderEmail ? { replyTo: fromEmail } : {})
    };
    
    // Log email details
    if (fromEmail && fromEmail !== defaultSenderEmail) {
      console.log(`📧 [EMAIL] Using Reply-To: ${fromEmail} (${fromName || 'Building Owner'})`);
      console.log(`📧 [EMAIL] Actual sender (SMTP): ${defaultSenderEmail}`);
    }

    // Send email
    console.log(`📧 [EMAIL] Attempting to send email to: ${to}`);
    console.log(`📧 [EMAIL] Subject: ${subject}`);
    console.log(`📧 [EMAIL] From: ${mailOptions.from}`);
    
    const result = await transporter.sendMail(mailOptions);
    console.log(`✅ [EMAIL] Email sent successfully to ${to}`);
    console.log(`📋 [EMAIL] Message ID: ${result.messageId}`);
    console.log(`📋 [EMAIL] Response: ${result.response}`);
    console.log(`📋 [EMAIL] Accepted: ${JSON.stringify(result.accepted)}`);
    if (result.rejected && result.rejected.length > 0) {
      console.log(`📋 [EMAIL] Rejected: ${JSON.stringify(result.rejected)}`);
    }
    
    return { 
      success: true, 
      message: 'Email sent successfully',
      messageId: result.messageId,
      response: result.response,
      accepted: result.accepted,
      rejected: result.rejected
    };

  } catch (error) {
    console.error('❌ [EMAIL] Error sending email:', error);
    console.error('❌ [EMAIL] Error details:', {
      code: error.code,
      command: error.command,
      response: error.response,
      responseCode: error.responseCode
    });
    
    // Provide user-friendly error messages
    let errorMessage = 'Failed to send email. Please try again.';
    
    if (error.code === 'EAUTH') {
      errorMessage = 'Email authentication failed. Please check Brevo API key.';
    } else if (error.code === 'ECONNECTION') {
      errorMessage = 'Failed to connect to email server. Please check network connection.';
    } else if (error.responseCode === 550) {
      errorMessage = 'Invalid recipient email address.';
    } else if (error.message) {
      errorMessage = `Email service error: ${error.message}`;
    }
    
    return { 
      success: false, 
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    };
  }
};

// Send OTP email
const sendOTPEmail = async (email, otp, purpose = 'verification', fromEmail = null, fromName = null) => {
  if (!email) {
    console.log('⚠️ [EMAIL] No email address provided for OTP');
    return { success: false, message: 'No email address provided' };
  }

  const purposeLabels = {
    'registration': 'Registration',
    'login': 'Login',
    'admin_registration': 'Admin Registration',
    'password_reset': 'Password Reset',
    'verification': 'Verification',
    'resident_creation': 'Account Creation'
  };

  console.log(`📧 [EMAIL] Preparing OTP email for ${purposeLabels[purpose] || purpose}`);
  console.log(`📧 [EMAIL] Recipient: ${email}`);
  console.log(`📧 [EMAIL] OTP Code: ${otp.toString()}`);
  if (fromEmail) {
    console.log(`📧 [EMAIL] Sending from: ${fromEmail} (${fromName || 'Building Owner'})`);
  }

  const templateVars = {
    otp: otp.toString(),
    purpose: purposeLabels[purpose] || purpose,
    validity: 10, // OTP validity in minutes
    currentYear: new Date().getFullYear()
  };

  try {
    console.log(`📧 [EMAIL] Loading OTP template: ${EMAIL_TEMPLATES.OTP}`);
    const html = await loadEmailTemplate(EMAIL_TEMPLATES.OTP, templateVars);
    console.log(`✅ [EMAIL] OTP email template loaded successfully`);
    
    const subject = `Your ApartmentSync OTP - ${purposeLabels[purpose] || purpose}`;
    console.log(`📧 [EMAIL] Sending OTP email with subject: ${subject}`);
    console.log(`📧 [EMAIL] Recipient: ${email}`);
    console.log(`📧 [EMAIL] OTP Code: ${otp.toString()}`);
    
    const result = await sendEmail(email, subject, html, [], null, fromEmail, fromName);
    
    if (result.success) {
      console.log(`✅ [EMAIL] OTP email sent successfully to ${email}`);
      console.log(`📋 [EMAIL] Message ID: ${result.messageId || 'N/A'}`);
      console.log(`📋 [EMAIL] Response: ${result.response || 'N/A'}`);
      if (purpose === 'admin_registration') {
        console.log(`✅ [EMAIL] Admin Registration OTP email delivered to Gmail: ${email}`);
      }
      if (purpose === 'resident_creation') {
        console.log(`✅ [EMAIL] Resident creation OTP email sent successfully`);
        console.log(`📧 [EMAIL] Reply-To will be: ${fromEmail || 'default sender'}`);
      }
    } else {
      console.error(`❌ [EMAIL] OTP email sending failed to ${email}`);
      console.error(`❌ [EMAIL] Error: ${result.message}`);
      console.error(`❌ [EMAIL] Error details:`, result.error);
    }
    
    return result;
  } catch (error) {
    console.error(`❌ [EMAIL] Error in sendOTPEmail:`, error.message);
    console.error(`❌ [EMAIL] Error Stack:`, error.stack);
    return {
      success: false,
      message: `Failed to send OTP email: ${error.message}`,
      error: error.message
    };
  }
};

// Send welcome email to new user
const sendWelcomeEmail = async (user) => {
  if (!user.email) {
    console.log(`⚠️ [EMAIL] No email address for user ${user._id}`);
    return { success: false, message: 'No email address' };
  }

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

// Send admin welcome email
const sendAdminWelcomeEmail = async (user) => {
  if (!user.email) {
    console.log(`⚠️ [EMAIL] No email address for admin ${user._id}`);
    return { success: false, message: 'No email address' };
  }

  const templateVars = {
    fullName: user.fullName,
    loginUrl: `${process.env.FRONTEND_URL}/login`,
    supportEmail: process.env.SUPPORT_EMAIL || 'support@apartmentsync.com'
  };

  // Use welcome template for admin (admin_welcome template can be created later)
  let html;
  try {
    html = await loadEmailTemplate(EMAIL_TEMPLATES.ADMIN_WELCOME, templateVars);
  } catch (error) {
    // Fallback to welcome template if admin_welcome doesn't exist
    html = await loadEmailTemplate(EMAIL_TEMPLATES.WELCOME, templateVars);
  }
  
  return await sendEmail(
    user.email,
    'Welcome to ApartmentSync - Admin Account Created',
    html
  );
};

// Send staff welcome email
const sendStaffWelcomeEmail = async (user) => {
  if (!user.email) {
    console.log(`⚠️ [EMAIL] No email address for staff ${user._id}`);
    return { success: false, message: 'No email address' };
  }

  const templateVars = {
    fullName: user.fullName,
    apartmentCode: user.apartmentCode,
    loginUrl: `${process.env.FRONTEND_URL}/login`,
    supportEmail: process.env.SUPPORT_EMAIL || 'support@apartmentsync.com'
  };

  const html = await loadEmailTemplate(EMAIL_TEMPLATES.WELCOME, templateVars);
  
  return await sendEmail(
    user.email,
    'Welcome to ApartmentSync - Staff Account Created',
    html
  );
};

// Send admin OTP for user creation verification
const sendAdminUserCreationOTP = async (adminEmail, otp, userData) => {
  if (!adminEmail) {
    console.log(`⚠️ [EMAIL] No admin email address provided`);
    return { success: false, message: 'No admin email address' };
  }

  const templateVars = {
    fullName: userData.fullName,
    email: userData.email,
    phoneNumber: userData.phoneNumber,
    role: userData.role === 'resident' ? 'Resident' : (userData.role === 'staff' ? 'Staff' : 'User'),
    apartmentCode: userData.apartmentCode || userData.buildingCode,
    wing: userData.wing,
    flatNumber: userData.flatNumber,
    flatType: userData.flatType,
    otp: otp.toString(),
    validity: 10, // OTP validity in minutes
    supportEmail: process.env.SUPPORT_EMAIL || 'support@apartmentsync.com',
    currentYear: new Date().getFullYear()
  };

  try {
    const html = await loadEmailTemplate(EMAIL_TEMPLATES.ADMIN_USER_CREATION_OTP, templateVars);
    console.log(`✅ [EMAIL] Admin user creation OTP template loaded successfully`);
    
    const subject = `OTP Verification Required - Create User Account`;
    console.log(`📧 [EMAIL] Sending admin OTP email to ${adminEmail}`);
    
    const result = await sendEmail(adminEmail, subject, html);
    
    if (result.success) {
      console.log(`✅ [EMAIL] Admin OTP email sent successfully to ${adminEmail}`);
    } else {
      console.error(`❌ [EMAIL] Admin OTP email sending failed to ${adminEmail}`);
      console.error(`❌ [EMAIL] Error: ${result.message}`);
    }
    
    return result;
  } catch (error) {
    console.error(`❌ [EMAIL] Error in sendAdminUserCreationOTP:`, error.message);
    return {
      success: false,
      message: `Failed to send admin OTP email: ${error.message}`,
      error: error.message
    };
  }
};

// Send account confirmation email to newly created user
const sendAccountConfirmationEmail = async (user) => {
  if (!user.email) {
    console.log(`⚠️ [EMAIL] No email address for user ${user._id}`);
    return { success: false, message: 'No email address' };
  }

  const templateVars = {
    fullName: user.fullName,
    email: user.email,
    phoneNumber: user.phoneNumber,
    role: user.role === 'resident' ? 'Resident' : (user.role === 'staff' ? 'Staff' : 'User'),
    apartmentCode: user.apartmentCode,
    wing: user.wing,
    flatNumber: user.flatNumber,
    flatType: user.flatType,
    loginUrl: `${process.env.FRONTEND_URL}/login`,
    supportEmail: process.env.SUPPORT_EMAIL || 'support@apartmentsync.com',
    currentYear: new Date().getFullYear()
  };

  try {
    const html = await loadEmailTemplate(EMAIL_TEMPLATES.ACCOUNT_CONFIRMATION, templateVars);
    console.log(`✅ [EMAIL] Account confirmation email template loaded successfully`);
    
    const subject = `Welcome to ApartmentSync - Your Account is Ready!`;
    console.log(`📧 [EMAIL] Sending account confirmation email to ${user.email}`);
    
    const result = await sendEmail(user.email, subject, html);
    
    if (result.success) {
      console.log(`✅ [EMAIL] Account confirmation email sent successfully to ${user.email}`);
    } else {
      console.error(`❌ [EMAIL] Account confirmation email sending failed to ${user.email}`);
      console.error(`❌ [EMAIL] Error: ${result.message}`);
    }
    
    return result;
  } catch (error) {
    console.error(`❌ [EMAIL] Error in sendAccountConfirmationEmail:`, error.message);
    return {
      success: false,
      message: `Failed to send account confirmation email: ${error.message}`,
      error: error.message
    };
  }
};

// Send notification to admin when new user is created
const sendAdminNewUserNotification = async (adminEmail, user, createdByAdmin = false) => {
  if (!adminEmail) {
    console.log(`⚠️ [EMAIL] No admin email address provided`);
    return { success: false, message: 'No admin email address' };
  }

  const createdAt = new Date().toLocaleString('en-IN', { 
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short'
  });

  const templateVars = {
    fullName: user.fullName,
    initial: user.fullName ? user.fullName.charAt(0).toUpperCase() : 'U',
    email: user.email || 'Not provided',
    phoneNumber: user.phoneNumber || 'Not provided',
    role: user.role === 'resident' ? 'Resident' : (user.role === 'staff' ? 'Staff' : 'User'),
    apartmentCode: user.apartmentCode,
    wing: user.wing,
    floorNumber: user.floorNumber,
    flatNumber: user.flatNumber,
    flatType: user.flatType,
    createdAt: createdAt,
    dashboardUrl: `${process.env.FRONTEND_URL}/admin/users`,
    currentYear: new Date().getFullYear()
  };

  try {
    const html = await loadEmailTemplate(EMAIL_TEMPLATES.ADMIN_NEW_USER_NOTIFICATION, templateVars);
    console.log(`✅ [EMAIL] Admin new user notification template loaded`);
    
    const subject = `New ${user.role === 'resident' ? 'Resident' : 'Staff'} Account Created - ${user.fullName}`;
    console.log(`📧 [EMAIL] Sending admin notification to ${adminEmail}`);
    
    const result = await sendEmail(adminEmail, subject, html);
    
    if (result.success) {
      console.log(`✅ [EMAIL] Admin notification sent successfully to ${adminEmail}`);
    } else {
      console.error(`❌ [EMAIL] Admin notification failed: ${result.message}`);
    }
    
    return result;
  } catch (error) {
    console.error(`❌ [EMAIL] Error in sendAdminNewUserNotification:`, error.message);
    return {
      success: false,
      message: `Failed to send admin notification: ${error.message}`,
      error: error.message
    };
  }
};

// Send status change notification to user
const sendUserStatusChangeEmail = async (user, oldStatus, newStatus, reason = null) => {
  if (!user.email) {
    console.log(`⚠️ [EMAIL] No email address for user ${user._id}`);
    return { success: false, message: 'No email address' };
  }

  // Status configuration
  const statusConfig = {
    'active': {
      icon: '✓',
      class: 'approved',
      message: 'Your account is now active. You can access all features of ApartmentSync.',
      bgColor: '#dcfce7',
      textColor: '#166534'
    },
    'approved': {
      icon: '✓',
      class: 'approved',
      message: 'Your account has been approved by the administration.',
      bgColor: '#dcfce7',
      textColor: '#166534'
    },
    'rejected': {
      icon: '✗',
      class: 'rejected',
      message: 'Your account registration has been rejected.',
      bgColor: '#fee2e2',
      textColor: '#991b1b'
    },
    'suspended': {
      icon: '⚠',
      class: 'suspended',
      message: 'Your account has been suspended. Please contact admin for assistance.',
      bgColor: '#fef3c7',
      textColor: '#92400e'
    },
    'pending': {
      icon: '⏳',
      class: 'pending',
      message: 'Your account is pending approval from the administration.',
      bgColor: '#e0e7ff',
      textColor: '#3730a3'
    },
    'inactive': {
      icon: '○',
      class: 'suspended',
      message: 'Your account has been marked as inactive.',
      bgColor: '#fef3c7',
      textColor: '#92400e'
    }
  };

  const config = statusConfig[newStatus.toLowerCase()] || statusConfig['pending'];
  const updatedAt = new Date().toLocaleString('en-IN', { 
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short'
  });

  const templateVars = {
    fullName: user.fullName,
    email: user.email,
    apartmentCode: user.apartmentCode,
    wing: user.wing,
    flatNumber: user.flatNumber,
    oldStatus: oldStatus ? oldStatus.charAt(0).toUpperCase() + oldStatus.slice(1) : 'Unknown',
    newStatus: newStatus.charAt(0).toUpperCase() + newStatus.slice(1),
    statusIcon: config.icon,
    statusClass: config.class,
    statusMessage: config.message,
    newStatusBg: config.bgColor,
    newStatusColor: config.textColor,
    reason: reason,
    updatedAt: updatedAt,
    loginUrl: `${process.env.FRONTEND_URL}/login`,
    supportEmail: process.env.SUPPORT_EMAIL || 'support@apartmentsync.com',
    currentYear: new Date().getFullYear()
  };

  try {
    const html = await loadEmailTemplate(EMAIL_TEMPLATES.USER_STATUS_CHANGE, templateVars);
    console.log(`✅ [EMAIL] User status change template loaded`);
    
    const subject = `Account Status Update - ${newStatus.charAt(0).toUpperCase() + newStatus.slice(1)}`;
    console.log(`📧 [EMAIL] Sending status change email to ${user.email}`);
    
    const result = await sendEmail(user.email, subject, html);
    
    if (result.success) {
      console.log(`✅ [EMAIL] Status change email sent successfully to ${user.email}`);
    } else {
      console.error(`❌ [EMAIL] Status change email failed: ${result.message}`);
    }
    
    return result;
  } catch (error) {
    console.error(`❌ [EMAIL] Error in sendUserStatusChangeEmail:`, error.message);
    return {
      success: false,
      message: `Failed to send status change email: ${error.message}`,
      error: error.message
    };
  }
};

// Send account creation success email with OTP (deprecated - use separate templates)
const sendAccountCreatedEmail = async (user, otp) => {
  if (!user.email) {
    console.log(`⚠️ [EMAIL] No email address for user ${user._id}`);
    return { success: false, message: 'No email address' };
  }

  const templateVars = {
    fullName: user.fullName,
    email: user.email,
    phoneNumber: user.phoneNumber,
    role: user.role === 'resident' ? 'Resident' : (user.role === 'staff' ? 'Staff' : 'User'),
    apartmentCode: user.apartmentCode,
    wing: user.wing,
    flatNumber: user.flatNumber,
    flatType: user.flatType,
    otp: otp.toString(),
    validity: 10, // OTP validity in minutes
    loginUrl: `${process.env.FRONTEND_URL}/login`,
    supportEmail: process.env.SUPPORT_EMAIL || 'support@apartmentsync.com',
    currentYear: new Date().getFullYear()
  };

  try {
    const html = await loadEmailTemplate(EMAIL_TEMPLATES.ACCOUNT_CREATED, templateVars);
    console.log(`✅ [EMAIL] Account created email template loaded successfully`);
    
    const subject = `Welcome to ApartmentSync - Verify Your Email`;
    console.log(`📧 [EMAIL] Sending account creation email with OTP to ${user.email}`);
    
    const result = await sendEmail(user.email, subject, html);
    
    if (result.success) {
      console.log(`✅ [EMAIL] Account creation email sent successfully to ${user.email}`);
    } else {
      console.error(`❌ [EMAIL] Account creation email sending failed to ${user.email}`);
      console.error(`❌ [EMAIL] Error: ${result.message}`);
    }
    
    return result;
  } catch (error) {
    console.error(`❌ [EMAIL] Error in sendAccountCreatedEmail:`, error.message);
    console.error(`❌ [EMAIL] Error Stack:`, error.stack);
    return {
      success: false,
      message: `Failed to send account creation email: ${error.message}`,
      error: error.message
    };
  }
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
  if (!user.email) {
    console.log(`⚠️ [EMAIL] No email address for user ${user._id}`);
    return { success: false, message: 'No email address' };
  }

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

// Send password changed email
const sendPasswordChangedEmail = async (user) => {
  if (!user.email) {
    console.log(`⚠️ [EMAIL] No email address for user ${user._id}`);
    return { success: false, message: 'No email address' };
  }

  const templateVars = {
    fullName: user.fullName,
    email: user.email,
    timestamp: new Date().toLocaleString('en-IN', { 
      timeZone: 'Asia/Kolkata',
      dateStyle: 'long',
      timeStyle: 'short'
    }),
    supportEmail: process.env.SUPPORT_EMAIL || 'support@apartmentsync.com',
    frontendUrl: process.env.FRONTEND_URL || 'https://apartmentsync.com',
    currentYear: new Date().getFullYear()
  };

  const html = await loadEmailTemplate(EMAIL_TEMPLATES.PASSWORD_CHANGED, templateVars);
  
  return await sendEmail(
    user.email,
    'Password Changed Successfully - ApartmentSync',
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

// Send visitor entry email to flat owner
const sendVisitorEntryEmail = async (hostResident, visitorData) => {
  if (!hostResident.email) {
    console.log(`⚠️ [EMAIL] No email address for resident ${hostResident._id}`);
    return { success: false, message: 'No email address' };
  }

  const entryDate = visitorData.entryDate 
    ? new Date(visitorData.entryDate).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
    : new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

  const expectedCheckOutTime = visitorData.expectedCheckOutTime
    ? new Date(visitorData.expectedCheckOutTime).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
    : null;

  const templateVars = {
    fullName: hostResident.fullName,
    visitorName: visitorData.visitorName,
    phoneNumber: visitorData.phoneNumber,
    visitorType: visitorData.visitorType,
    flatNumber: visitorData.flatNumber || `${hostResident.wing}-${hostResident.flatNumber}`,
    purpose: visitorData.purpose,
    vehicleNumber: visitorData.vehicleNumber,
    status: visitorData.status || 'Pending',
    entryDate: entryDate,
    expectedCheckOutTime: expectedCheckOutTime,
    visitorId: visitorData.visitorId
  };

  const html = await loadEmailTemplate(EMAIL_TEMPLATES.VISITOR_ENTRY, templateVars);
  
  return await sendEmail(
    hostResident.email,
    `New Visitor Entry - ${visitorData.visitorName}`,
    html
  );
};

// Send visitor check-in email to flat owner
const sendVisitorCheckInEmail = async (hostResident, visitorData) => {
  if (!hostResident.email) {
    console.log(`⚠️ [EMAIL] No email address for resident ${hostResident._id}`);
    return { success: false, message: 'No email address' };
  }

  const checkInTime = visitorData.checkInTime
    ? new Date(visitorData.checkInTime).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
    : new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

  const templateVars = {
    fullName: hostResident.fullName,
    visitorName: visitorData.visitorName,
    phoneNumber: visitorData.phoneNumber,
    visitorType: visitorData.visitorType,
    flatNumber: visitorData.flatNumber || `${hostResident.wing}-${hostResident.flatNumber}`,
    checkInTime: checkInTime,
    checkInMethod: visitorData.checkInMethod || 'Manual',
    visitorId: visitorData.visitorId
  };

  const html = await loadEmailTemplate(EMAIL_TEMPLATES.VISITOR_CHECKIN, templateVars);
  
  return await sendEmail(
    hostResident.email,
    `Visitor Checked In - ${visitorData.visitorName}`,
    html
  );
};

// Send visitor status update email to flat owner
const sendVisitorStatusUpdateEmail = async (hostResident, visitorData) => {
  if (!hostResident.email) {
    console.log(`⚠️ [EMAIL] No email address for resident ${hostResident._id}`);
    return { success: false, message: 'No email address' };
  }

  const templateVars = {
    fullName: hostResident.fullName,
    visitorName: visitorData.visitorName,
    phoneNumber: visitorData.phoneNumber,
    visitorType: visitorData.visitorType,
    flatNumber: visitorData.flatNumber || `${hostResident.wing}-${hostResident.flatNumber}`,
    oldStatus: visitorData.oldStatus || 'Pending',
    newStatus: visitorData.newStatus || 'Pending',
    reason: visitorData.reason || 'No reason provided',
    visitorId: visitorData.visitorId,
    updatedAt: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
  };

  const html = await loadEmailTemplate(EMAIL_TEMPLATES.VISITOR_STATUS_UPDATE, templateVars);
  
  return await sendEmail(
    hostResident.email,
    `Visitor Status Updated - ${visitorData.newStatus}`,
    html
  );
};

// Send email to admin when new complaint is created
const sendAdminNewComplaintEmail = async (adminEmail, complaint, creator, location) => {
  if (!adminEmail) {
    console.log(`⚠️ [EMAIL] No admin email address provided`);
    return { success: false, message: 'No admin email address' };
  }

  const createdAt = new Date(complaint.createdAt).toLocaleString('en-IN', { 
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short'
  });

  const priorityLower = (complaint.priority || 'medium').toLowerCase();

  const templateVars = {
    ticketNumber: complaint.ticketNumber,
    createdBy: creator.fullName,
    category: complaint.category,
    priority: complaint.priority,
    priorityLower: priorityLower,
    status: complaint.status,
    location: location,
    description: complaint.description || 'No description provided',
    createdAt: createdAt,
    complaintUrl: `${process.env.FRONTEND_URL}/admin/complaints/${complaint._id}`,
    currentYear: new Date().getFullYear()
  };

  try {
    const html = await loadEmailTemplate(EMAIL_TEMPLATES.ADMIN_NEW_COMPLAINT, templateVars);
    console.log(`✅ [EMAIL] Admin new complaint email template loaded`);
    
    const subject = `New Complaint Received - Ticket #${complaint.ticketNumber}`;
    console.log(`📧 [EMAIL] Sending admin new complaint email to ${adminEmail}`);
    
    const result = await sendEmail(adminEmail, subject, html);
    
    if (result.success) {
      console.log(`✅ [EMAIL] Admin new complaint email sent successfully to ${adminEmail}`);
    } else {
      console.error(`❌ [EMAIL] Admin new complaint email failed: ${result.message}`);
    }
    
    return result;
  } catch (error) {
    console.error(`❌ [EMAIL] Error in sendAdminNewComplaintEmail:`, error.message);
    return {
      success: false,
      message: `Failed to send admin new complaint email: ${error.message}`,
      error: error.message
    };
  }
};

// Send email to admin when complaint status changes
const sendAdminComplaintStatusChangeEmail = async (adminEmail, complaint, oldStatus, newStatus, updatedBy, location) => {
  if (!adminEmail) {
    console.log(`⚠️ [EMAIL] No admin email address provided`);
    return { success: false, message: 'No admin email address' };
  }

  const updatedAt = new Date().toLocaleString('en-IN', { 
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short'
  });

  const templateVars = {
    ticketNumber: complaint.ticketNumber,
    title: complaint.title,
    category: complaint.category,
    priority: complaint.priority,
    oldStatus: oldStatus,
    newStatus: newStatus,
    createdBy: complaint.createdBy?.fullName || 'Unknown',
    location: location,
    updatedBy: updatedBy || 'Admin',
    updatedAt: updatedAt,
    complaintUrl: `${process.env.FRONTEND_URL}/admin/complaints/${complaint._id}`,
    currentYear: new Date().getFullYear()
  };

  try {
    const html = await loadEmailTemplate(EMAIL_TEMPLATES.ADMIN_COMPLAINT_STATUS_CHANGE, templateVars);
    console.log(`✅ [EMAIL] Admin complaint status change email template loaded`);
    
    const subject = `Complaint Status Updated - Ticket #${complaint.ticketNumber}`;
    console.log(`📧 [EMAIL] Sending admin status change email to ${adminEmail}`);
    
    const result = await sendEmail(adminEmail, subject, html);
    
    if (result.success) {
      console.log(`✅ [EMAIL] Admin status change email sent successfully to ${adminEmail}`);
    } else {
      console.error(`❌ [EMAIL] Admin status change email failed: ${result.message}`);
    }
    
    return result;
  } catch (error) {
    console.error(`❌ [EMAIL] Error in sendAdminComplaintStatusChangeEmail:`, error.message);
    return {
      success: false,
      message: `Failed to send admin status change email: ${error.message}`,
      error: error.message
    };
  }
};

// Send visitor check-out email to flat owner
const sendVisitorCheckOutEmail = async (hostResident, visitorData) => {
  if (!hostResident.email) {
    console.log(`⚠️ [EMAIL] No email address for resident ${hostResident._id}`);
    return { success: false, message: 'No email address' };
  }

  const checkOutTime = visitorData.checkOutTime
    ? new Date(visitorData.checkOutTime).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })
    : new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

  // Calculate duration if check-in time is available
  let duration = null;
  if (visitorData.checkInTime && visitorData.checkOutTime) {
    const checkIn = new Date(visitorData.checkInTime);
    const checkOut = new Date(visitorData.checkOutTime);
    const diffMs = checkOut - checkIn;
    const diffMins = Math.floor(diffMs / 60000);
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    duration = hours > 0 ? `${hours} hour${hours > 1 ? 's' : ''} ${mins} minute${mins > 1 ? 's' : ''}` : `${mins} minutes`;
  }

  const templateVars = {
    fullName: hostResident.fullName,
    visitorName: visitorData.visitorName,
    phoneNumber: visitorData.phoneNumber,
    visitorType: visitorData.visitorType,
    flatNumber: visitorData.flatNumber || `${hostResident.wing}-${hostResident.flatNumber}`,
    checkOutTime: checkOutTime,
    duration: duration,
    visitorId: visitorData.visitorId
  };

  const html = await loadEmailTemplate(EMAIL_TEMPLATES.VISITOR_CHECKOUT, templateVars);
  
  return await sendEmail(
    hostResident.email,
    `Visitor Checked Out - ${visitorData.visitorName}`,
    html
  );
};

module.exports = {
  sendEmail,
  sendOTPEmail,
  sendWelcomeEmail,
  sendAdminWelcomeEmail,
  sendStaffWelcomeEmail,
  sendAccountCreatedEmail,
  sendAdminUserCreationOTP,
  sendAccountConfirmationEmail,
  sendAdminNewUserNotification,
  sendUserStatusChangeEmail,
  sendComplaintRegisteredEmail,
  sendAdminNewComplaintEmail,
  sendAdminComplaintStatusChangeEmail,
  sendComplaintStatusUpdateEmail,
  sendComplaintResolvedEmail,
  sendNoticePublishedEmail,
  sendPaymentReminderEmail,
  sendAccountApprovedEmail,
  sendAccountRejectedEmail,
  sendPasswordResetEmail,
  sendSecurityAlertEmail,
  sendPasswordChangedEmail,
  sendBulkEmail,
  sendVisitorEntryEmail,
  sendVisitorCheckInEmail,
  sendVisitorCheckOutEmail,
  sendVisitorStatusUpdateEmail,
  emailScheduler,
  EMAIL_TEMPLATES
};