import { Resend } from 'resend';
import dotenv from 'dotenv';

dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);

export class EmailService {
  static async sendVerificationEmail(user, verificationToken) {
    const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3001'}/verify-email?token=${verificationToken}`;
    
    try {
      const { data, error } = await resend.emails.send({
        from: process.env.EMAIL_FROM || 'WordsTo.Link <onboarding@wordsto.link>',
        to: [user.email],
        subject: 'Verify your WordsTo.Link account',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to WordsTo.Link!</h1>
            </div>
            
            <div style="background: white; padding: 30px; border: 1px solid #e5e5e5; border-top: none; border-radius: 0 0 10px 10px;">
              <h2 style="color: #333; margin-top: 0;">Hi ${user.full_name || user.identifier}! 👋</h2>
              
              <p style="font-size: 16px; color: #666;">
                Thanks for signing up for WordsTo.Link! You're just one click away from creating smart, memorable URLs.
              </p>
              
              <p style="font-size: 16px; color: #666;">
                Please verify your email address by clicking the button below:
              </p>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${verificationUrl}" style="display: inline-block; padding: 14px 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 25px; font-weight: bold; font-size: 16px;">
                  Verify Email Address
                </a>
              </div>
              
              <p style="font-size: 14px; color: #999; margin-top: 30px;">
                Or copy and paste this link in your browser:
              </p>
              <p style="font-size: 14px; color: #667eea; word-break: break-all;">
                ${verificationUrl}
              </p>
              
              <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e5e5;">
                <p style="font-size: 14px; color: #666; margin-bottom: 10px;">
                  <strong>Your unique identifier:</strong> <code style="background: #f5f5f5; padding: 3px 6px; border-radius: 3px;">${user.identifier}</code>
                </p>
                <p style="font-size: 14px; color: #999;">
                  This means your shortened URLs will look like:<br>
                  <code style="background: #f5f5f5; padding: 3px 6px; border-radius: 3px;">wordsto.link/${user.identifier}/your-keywords</code>
                </p>
              </div>
              
              <p style="font-size: 12px; color: #999; margin-top: 30px;">
                This verification link will expire in 24 hours. If you didn't create an account with WordsTo.Link, you can safely ignore this email.
              </p>
            </div>
            
            <div style="text-align: center; margin-top: 20px;">
              <p style="font-size: 12px; color: #999;">
                © ${new Date().getFullYear()} WordsTo.Link. All rights reserved.
              </p>
            </div>
          </body>
          </html>
        `
      });

      if (error) {
        console.error('Failed to send verification email:', error);
        return { success: false, error };
      }

      console.log('Verification email sent successfully:', data?.id);
      return { success: true, data };
    } catch (error) {
      console.error('Error sending verification email:', error);
      return { success: false, error };
    }
  }

  static async sendWelcomeEmail(user) {
    try {
      const { data, error } = await resend.emails.send({
        from: process.env.EMAIL_FROM || 'WordsTo.Link <onboarding@wordsto.link>',
        to: [user.email],
        subject: '🎉 Welcome to WordsTo.Link!',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 28px;">🎉 Email Verified!</h1>
            </div>
            
            <div style="background: white; padding: 30px; border: 1px solid #e5e5e5; border-top: none; border-radius: 0 0 10px 10px;">
              <h2 style="color: #333; margin-top: 0;">Welcome aboard, ${user.full_name || user.identifier}!</h2>
              
              <p style="font-size: 16px; color: #666;">
                Your email has been verified and your WordsTo.Link account is now fully activated!
              </p>
              
              <h3 style="color: #333; margin-top: 30px;">🚀 Quick Start Guide</h3>
              
              <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h4 style="color: #667eea; margin-top: 0;">1. Create Your First Short Link</h4>
                <p style="color: #666; margin: 10px 0;">
                  Navigate to your dashboard and click "Create Link" to shorten your first URL with memorable keywords.
                </p>
                
                <h4 style="color: #667eea;">2. Use Your Unique Identifier</h4>
                <p style="color: #666; margin: 10px 0;">
                  Your identifier <code style="background: white; padding: 2px 6px; border-radius: 3px;">${user.identifier}</code> is part of all your URLs:
                  <br><code style="background: white; padding: 2px 6px; border-radius: 3px;">wordsto.link/${user.identifier}/your-keywords</code>
                </p>
                
                <h4 style="color: #667eea;">3. Track Your Links</h4>
                <p style="color: #666; margin: 10px 0 0 0;">
                  Monitor clicks, geographic data, and referrers for all your shortened URLs in real-time.
                </p>
              </div>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${process.env.FRONTEND_URL || 'http://localhost:3001'}/dashboard" style="display: inline-block; padding: 14px 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 25px; font-weight: bold; font-size: 16px;">
                  Go to Dashboard
                </a>
              </div>
              
              <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p style="color: #856404; margin: 0; font-size: 14px;">
                  <strong>💡 Pro Tip:</strong> Bookmark your dashboard for quick access to create and manage your shortened URLs.
                </p>
              </div>
              
              <h3 style="color: #333; margin-top: 30px;">📚 Resources</h3>
              <ul style="color: #666;">
                <li><a href="${process.env.FRONTEND_URL || 'http://localhost:3001'}/docs" style="color: #667eea;">Documentation</a> - Learn about all features</li>
                <li><a href="${process.env.FRONTEND_URL || 'http://localhost:3001'}/api-docs" style="color: #667eea;">API Reference</a> - Integrate with your apps</li>
                <li><a href="mailto:support@wordsto.link" style="color: #667eea;">Support</a> - We're here to help</li>
              </ul>
              
              <p style="font-size: 14px; color: #999; margin-top: 30px;">
                Happy link shortening! 🔗
              </p>
            </div>
            
            <div style="text-align: center; margin-top: 20px;">
              <p style="font-size: 12px; color: #999;">
                © ${new Date().getFullYear()} WordsTo.Link. All rights reserved.
              </p>
            </div>
          </body>
          </html>
        `
      });

      if (error) {
        console.error('Failed to send welcome email:', error);
        return { success: false, error };
      }

      console.log('Welcome email sent successfully:', data?.id);
      return { success: true, data };
    } catch (error) {
      console.error('Error sending welcome email:', error);
      return { success: false, error };
    }
  }

  static async sendPasswordResetEmail(user, resetToken) {
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3001'}/reset-password?token=${resetToken}`;
    
    try {
      const { data, error } = await resend.emails.send({
        from: process.env.EMAIL_FROM || 'WordsTo.Link <onboarding@wordsto.link>',
        to: [user.email],
        subject: 'Reset your WordsTo.Link password',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
              <h1 style="color: white; margin: 0; font-size: 28px;">Password Reset Request</h1>
            </div>
            
            <div style="background: white; padding: 30px; border: 1px solid #e5e5e5; border-top: none; border-radius: 0 0 10px 10px;">
              <h2 style="color: #333; margin-top: 0;">Hi ${user.full_name || user.identifier},</h2>
              
              <p style="font-size: 16px; color: #666;">
                We received a request to reset your WordsTo.Link password. Click the button below to create a new password:
              </p>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${resetUrl}" style="display: inline-block; padding: 14px 30px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; border-radius: 25px; font-weight: bold; font-size: 16px;">
                  Reset Password
                </a>
              </div>
              
              <p style="font-size: 14px; color: #999;">
                Or copy and paste this link in your browser:
              </p>
              <p style="font-size: 14px; color: #667eea; word-break: break-all;">
                ${resetUrl}
              </p>
              
              <div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p style="color: #856404; margin: 0; font-size: 14px;">
                  <strong>⚠️ Important:</strong> This password reset link will expire in 1 hour for security reasons.
                </p>
              </div>
              
              <p style="font-size: 14px; color: #666;">
                If you didn't request a password reset, you can safely ignore this email. Your password won't be changed.
              </p>
              
              <p style="font-size: 12px; color: #999; margin-top: 30px;">
                For security reasons, this link will expire in 1 hour.
              </p>
            </div>
            
            <div style="text-align: center; margin-top: 20px;">
              <p style="font-size: 12px; color: #999;">
                © ${new Date().getFullYear()} WordsTo.Link. All rights reserved.
              </p>
            </div>
          </body>
          </html>
        `
      });

      if (error) {
        console.error('Failed to send password reset email:', error);
        return { success: false, error };
      }

      console.log('Password reset email sent successfully:', data?.id);
      return { success: true, data };
    } catch (error) {
      console.error('Error sending password reset email:', error);
      return { success: false, error };
    }
  }
}