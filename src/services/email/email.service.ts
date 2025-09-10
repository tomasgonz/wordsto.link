import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { config } from '../../config';
import { EmailTemplate, getEmailTemplate } from './templates';

export interface EmailOptions {
  to: string;
  subject: string;
  template: EmailTemplate;
  data: Record<string, any>;
}

export interface EmailProvider {
  send(options: EmailOptions): Promise<void>;
}

// Resend provider (Recommended - Modern email API)
class ResendProvider implements EmailProvider {
  private resend: Resend;

  constructor() {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error('RESEND_API_KEY is not configured');
    }
    this.resend = new Resend(apiKey);
  }

  async send(options: EmailOptions): Promise<void> {
    const { html, text } = getEmailTemplate(options.template, options.data);
    
    try {
      await this.resend.emails.send({
        from: process.env.EMAIL_FROM || 'WordsTo.Link <noreply@wordsto.link>',
        to: [options.to],
        subject: options.subject,
        html,
        text,
      });
    } catch (error) {
      console.error('Resend error:', error);
      throw error;
    }
  }
}

// Nodemailer provider (for SMTP, Gmail, etc.)
class NodemailerProvider implements EmailProvider {
  private transporter: nodemailer.Transporter;

  constructor() {
    // Use Gmail or any SMTP service
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  async send(options: EmailOptions): Promise<void> {
    const { html, text } = getEmailTemplate(options.template, options.data);
    
    await this.transporter.sendMail({
      from: process.env.EMAIL_FROM || 'noreply@wordsto.link',
      to: options.to,
      subject: options.subject,
      text,
      html,
    });
  }
}

// Development provider (logs emails to console)
class DevelopmentProvider implements EmailProvider {
  async send(options: EmailOptions): Promise<void> {
    const { html, text } = getEmailTemplate(options.template, options.data);
    
    console.log('');
    console.log('='.repeat(60));
    console.log('📧 EMAIL (Development Mode)');
    console.log('='.repeat(60));
    console.log('To:', options.to);
    console.log('Subject:', options.subject);
    console.log('Template:', options.template);
    console.log('-'.repeat(60));
    console.log('Data:', JSON.stringify(options.data, null, 2));
    console.log('-'.repeat(60));
    console.log('Text Preview:');
    console.log(text.substring(0, 200) + '...');
    console.log('='.repeat(60));
    console.log('');
  }
}

class EmailService {
  private provider: EmailProvider;

  constructor() {
    // Choose provider based on environment and configuration
    if (process.env.NODE_ENV === 'development' && !process.env.FORCE_EMAIL_SEND) {
      console.log('📧 Email service: Development mode (emails will be logged to console)');
      this.provider = new DevelopmentProvider();
    } else if (process.env.RESEND_API_KEY) {
      console.log('📧 Email service: Using Resend');
      this.provider = new ResendProvider();
    } else if (process.env.SMTP_USER) {
      console.log('📧 Email service: Using SMTP/Nodemailer');
      this.provider = new NodemailerProvider();
    } else {
      console.warn('⚠️ No email provider configured, using development mode');
      this.provider = new DevelopmentProvider();
    }
  }

  async sendVerificationEmail(email: string, verificationToken: string): Promise<void> {
    const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3001'}/verify-email?token=${verificationToken}`;
    
    await this.provider.send({
      to: email,
      subject: 'Verify your WordsTo.Link account',
      template: EmailTemplate.VERIFICATION,
      data: {
        verificationUrl,
        email,
      },
    });
  }

  async sendPasswordResetEmail(email: string, resetToken: string): Promise<void> {
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3001'}/reset-password?token=${resetToken}`;
    
    await this.provider.send({
      to: email,
      subject: 'Reset your WordsTo.Link password',
      template: EmailTemplate.PASSWORD_RESET,
      data: {
        resetUrl,
        email,
      },
    });
  }

  async sendWelcomeEmail(email: string, name: string, identifier: string): Promise<void> {
    await this.provider.send({
      to: email,
      subject: 'Welcome to WordsTo.Link!',
      template: EmailTemplate.WELCOME,
      data: {
        name,
        identifier,
        dashboardUrl: `${process.env.FRONTEND_URL || 'http://localhost:3001'}/dashboard`,
      },
    });
  }

  async sendLinkExpirationWarning(email: string, linkData: {
    shortUrl: string;
    originalUrl: string;
    expiresAt: Date;
  }): Promise<void> {
    await this.provider.send({
      to: email,
      subject: 'Your WordsTo.Link is expiring soon',
      template: EmailTemplate.LINK_EXPIRATION,
      data: linkData,
    });
  }

  async sendWeeklyReport(email: string, reportData: {
    totalClicks: number;
    totalLinks: number;
    topLinks: Array<{ url: string; clicks: number }>;
    period: string;
  }): Promise<void> {
    await this.provider.send({
      to: email,
      subject: `Your WordsTo.Link weekly report`,
      template: EmailTemplate.WEEKLY_REPORT,
      data: reportData,
    });
  }
}

export const emailService = new EmailService();