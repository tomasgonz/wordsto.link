const { Resend } = require('resend');
require('dotenv').config();

// Check if API key is set
if (!process.env.RESEND_API_KEY) {
  console.error('❌ RESEND_API_KEY not found in .env file');
  console.log('\n📝 Please add to your .env file:');
  console.log('RESEND_API_KEY=re_YOUR_API_KEY_HERE\n');
  process.exit(1);
}

const resend = new Resend(process.env.RESEND_API_KEY);

async function testEmail() {
  // Get email from command line or use default
  const testEmail = process.argv[2] || 'test@example.com';
  
  console.log('🚀 Testing Resend email setup...');
  console.log('📧 Sending test email to:', testEmail);
  console.log('🔑 Using API key:', process.env.RESEND_API_KEY.substring(0, 10) + '...');
  
  try {
    const data = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'WordsTo.Link <onboarding@resend.dev>',
      to: [testEmail],
      subject: '✅ WordsTo.Link Email Test Successful!',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
            <h1 style="margin: 0;">Email Test Successful! 🎉</h1>
          </div>
          <div style="padding: 30px; background: white; border: 1px solid #e2e8f0; border-radius: 0 0 10px 10px;">
            <h2 style="color: #2d3748;">Your Resend setup is working!</h2>
            <p style="color: #4a5568; line-height: 1.6;">
              This test email confirms that your WordsTo.Link email service is properly configured with Resend.
            </p>
            <div style="background: #f7fafc; padding: 15px; border-radius: 6px; margin: 20px 0;">
              <p style="margin: 0; color: #4a5568;"><strong>Configuration Details:</strong></p>
              <ul style="color: #4a5568;">
                <li>API Key: ${process.env.RESEND_API_KEY.substring(0, 10)}...</li>
                <li>From: ${process.env.EMAIL_FROM || 'onboarding@resend.dev'}</li>
                <li>Environment: ${process.env.NODE_ENV || 'development'}</li>
              </ul>
            </div>
            <p style="color: #4a5568;">
              You can now send:
            </p>
            <ul style="color: #4a5568;">
              <li>✅ Email verification messages</li>
              <li>✅ Password reset emails</li>
              <li>✅ Welcome emails</li>
              <li>✅ Link expiration warnings</li>
              <li>✅ Weekly reports</li>
            </ul>
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 30px 0;">
            <p style="color: #718096; font-size: 14px; text-align: center;">
              Sent via Resend API • ${new Date().toLocaleString()}
            </p>
          </div>
        </div>
      `,
      text: `
Email Test Successful!

Your Resend setup is working!

This test email confirms that your WordsTo.Link email service is properly configured with Resend.

Configuration Details:
- API Key: ${process.env.RESEND_API_KEY.substring(0, 10)}...
- From: ${process.env.EMAIL_FROM || 'onboarding@resend.dev'}
- Environment: ${process.env.NODE_ENV || 'development'}

You can now send:
✅ Email verification messages
✅ Password reset emails
✅ Welcome emails
✅ Link expiration warnings
✅ Weekly reports

Sent via Resend API • ${new Date().toLocaleString()}
      `.trim()
    });
    
    console.log('\n✅ Email sent successfully!');
    console.log('📬 Email ID:', data.id);
    console.log('\n📊 Check your email delivery status at:');
    console.log('   https://resend.com/emails');
    console.log('\n✨ Your Resend email setup is complete!');
    
  } catch (error) {
    console.error('\n❌ Error sending email:', error.message);
    
    if (error.message.includes('Invalid API')) {
      console.log('\n🔑 Your API key appears to be invalid.');
      console.log('   Get a new one at: https://resend.com/api-keys');
    } else if (error.message.includes('domain')) {
      console.log('\n🌐 Domain verification issue.');
      console.log('   If using a custom domain, verify it at: https://resend.com/domains');
      console.log('   Or use "onboarding@resend.dev" for testing');
    }
    
    console.log('\n📚 Resend documentation: https://resend.com/docs');
  }
}

// Run the test
testEmail();