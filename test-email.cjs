const { Resend } = require('resend');

// Load environment variables
require('dotenv').config();

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendTestEmail() {
  try {
    console.log('Sending test email to tomasgonz@gmail.com...');
    
    const { data, error } = await resend.emails.send({
      from: 'WordsTo.Link <onboarding@wordsto.link>',
      to: ['tomasgonz@gmail.com'],
      subject: 'Test Email from WordsTo.Link',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Test Email from WordsTo.Link</h2>
          <p>Hi Tomas,</p>
          <p>This is a test email to verify that the email system is working correctly.</p>
          <p>The email service is powered by Resend and is configured properly.</p>
          <div style="margin: 30px 0; padding: 20px; background-color: #f5f5f5; border-radius: 8px;">
            <h3 style="color: #666; margin-top: 0;">System Status:</h3>
            <ul style="color: #666;">
              <li>✅ Resend API configured</li>
              <li>✅ Email sending enabled</li>
              <li>✅ Authentication system working</li>
              <li>✅ User signup/login functional</li>
            </ul>
          </div>
          <p>Best regards,<br>WordsTo.Link Team</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
          <p style="font-size: 12px; color: #999;">
            This is an automated test email sent from the WordsTo.Link development environment.
          </p>
        </div>
      `
    });

    if (error) {
      console.error('Error sending email:', error);
      return;
    }

    console.log('✅ Email sent successfully!');
    console.log('Email ID:', data?.id);
  } catch (error) {
    console.error('Failed to send email:', error);
  }
}

// Run the test
sendTestEmail();