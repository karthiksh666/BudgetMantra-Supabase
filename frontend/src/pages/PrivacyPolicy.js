import { Link } from 'react-router-dom';
import { Wallet, Shield, ArrowLeft } from 'lucide-react';

const Section = ({ title, children }) => (
  <div className="mb-10">
    <h2 className="text-xl font-bold text-stone-800 font-['Outfit'] mb-4 pb-2 border-b border-stone-100">{title}</h2>
    <div className="space-y-3 text-stone-600 text-sm leading-relaxed">{children}</div>
  </div>
);

const PrivacyPolicy = () => (
  <div className="min-h-screen bg-[#fffaf5]">
    {/* Header */}
    <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-stone-100">
      <div className="max-w-4xl mx-auto px-6 py-4 flex justify-between items-center">
        <Link to="/" className="flex items-center gap-3 group">
          <div className="p-2 bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl shadow-lg shadow-orange-500/20">
            <Wallet size={22} className="text-white" />
          </div>
          <span className="text-lg font-bold text-stone-800 font-['Outfit']">Budget Mantra</span>
        </Link>
        <Link to="/" className="flex items-center gap-1.5 text-sm text-stone-500 hover:text-orange-600 transition-colors font-medium">
          <ArrowLeft size={15} /> Back to Home
        </Link>
      </div>
    </nav>

    <div className="max-w-4xl mx-auto px-6 py-16">
      {/* Hero */}
      <div className="mb-12 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-full mb-4">
          <Shield size={14} className="text-emerald-600" />
          <span className="text-sm font-medium text-emerald-700">Your privacy is our foundation</span>
        </div>
        <h1 className="text-4xl font-bold text-stone-900 font-['Outfit'] mb-3">Privacy Policy</h1>
        <p className="text-stone-500">Last updated: March 2026 &nbsp;·&nbsp; Effective date: March 2026</p>
      </div>

      {/* Trust callout */}
      <div className="bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-6 mb-12">
        <p className="text-emerald-800 font-bold text-base mb-1">Our core promise to you</p>
        <p className="text-emerald-700 text-sm leading-relaxed">
          BudgetMantra is a <strong>manual tracking app</strong>. We never ask for, store, or have access to your bank account credentials,
          UPI ID, credit/debit card numbers, net banking passwords, or any financial account login. You only enter numbers you choose to share.
          Your financial credentials stay between you and your bank — always.
        </p>
      </div>

      <div className="bg-white rounded-3xl border border-stone-100 shadow-sm p-8 lg:p-12">

        <Section title="1. Who We Are">
          <p>Budget Mantra ("we", "our", "us") is a personal finance tracking application built for users in India. We can be reached at <a href="mailto:mantrabudget@gmail.com" className="text-orange-600 hover:underline">mantrabudget@gmail.com</a>.</p>
          <p>This Privacy Policy explains what data we collect, how we use it, and the rights you have over your information when you use BudgetMantra.</p>
        </Section>

        <Section title="2. What Data We Collect">
          <p><strong className="text-stone-700">Account information:</strong> When you register, we collect your name and email address. If you sign in with Google, we receive your name, email, and profile photo from Google.</p>
          <p><strong className="text-stone-700">Financial tracking data:</strong> Budget categories and limits you set, income you enter, expense transactions you add manually, EMI/loan details you input, savings goals you create. This data is <em>entered entirely by you</em> — we have no automated feed from any bank or institution.</p>
          <p><strong className="text-stone-700">Usage data:</strong> We may log basic usage events (page views, feature interactions) to improve the product. We do not track behaviour for advertising purposes.</p>
          <p><strong className="text-stone-700">Device/technical data:</strong> Browser type, operating system, and IP address collected automatically when you access the app. Used for security and debugging only.</p>
        </Section>

        <Section title="3. What We Never Collect">
          <p>We explicitly do <strong className="text-stone-700">not</strong> collect or request:</p>
          <ul className="list-disc list-inside space-y-1 text-stone-600 ml-2">
            <li>Bank account numbers or net banking credentials</li>
            <li>UPI IDs, UPI PINs, or any payment instrument credentials</li>
            <li>Credit or debit card numbers, CVVs, or PINs</li>
            <li>Aadhaar, PAN, or any government identity numbers</li>
            <li>OTPs or authentication tokens for any third-party service</li>
          </ul>
          <p className="mt-2">If anyone claiming to be from BudgetMantra asks for the above, treat it as a phishing attempt and report it to us immediately.</p>
        </Section>

        <Section title="4. How We Use Your Data">
          <ul className="list-disc list-inside space-y-1.5 ml-2">
            <li>To provide and personalise the BudgetMantra service to you</li>
            <li>To calculate your Financial Health Score and budget analytics</li>
            <li>To power Chanakya AI responses (your data is sent to Anthropic's API; see Section 7)</li>
            <li>To send you EMI reminders and product notifications (only if you opt in)</li>
            <li>To respond to your support or feedback messages</li>
            <li>To detect and prevent fraud or abuse</li>
          </ul>
          <p>We do not use your data for advertising, profiling for third parties, or any purpose beyond operating the service.</p>
        </Section>

        <Section title="5. Data Storage & Security">
          <p>Your data is stored in <strong className="text-stone-700">MongoDB Atlas</strong> (hosted on AWS, Mumbai region) with TLS encryption in transit and AES-256 encryption at rest.</p>
          <p>Access to your data is protected by JWT-based authentication. Only you can access your account data using your credentials.</p>
          <p>We apply rate limiting, input validation, and industry-standard security practices. While no system is 100% secure, we take every reasonable measure to protect your information.</p>
        </Section>

        <Section title="6. Data Sharing">
          <p>We do <strong className="text-stone-700">not sell, rent, or trade</strong> your personal data to any third party.</p>
          <p>We share data only in these limited circumstances:</p>
          <ul className="list-disc list-inside space-y-1.5 ml-2">
            <li><strong className="text-stone-700">Anthropic (AI provider):</strong> Your budget/EMI context is sent to Anthropic's Claude API to generate Chanakya AI responses. Anthropic's API is not used to train their models on your data. See <a href="https://www.anthropic.com/privacy" className="text-orange-600 hover:underline" target="_blank" rel="noopener noreferrer">Anthropic's Privacy Policy</a>.</li>
            <li><strong className="text-stone-700">Google (authentication):</strong> If you use Google Sign-In, Google processes your authentication. See <a href="https://policies.google.com/privacy" className="text-orange-600 hover:underline" target="_blank" rel="noopener noreferrer">Google's Privacy Policy</a>.</li>
            <li><strong className="text-stone-700">Legal requirements:</strong> We may disclose data if required by Indian law or a valid court order.</li>
          </ul>
        </Section>

        <Section title="7. Chanakya AI & Your Data">
          <p>When you use Chanakya AI, we send relevant parts of your budget and EMI data to Anthropic's API to generate a response. This context is sent per-request and is not permanently stored by Anthropic for training purposes under their current API terms.</p>
          <p><strong className="text-stone-700">Important:</strong> Chanakya AI responses are for informational and planning purposes only. They do not constitute professional financial, tax, or investment advice. Always consult a SEBI-registered advisor for investment decisions.</p>
        </Section>

        <Section title="8. Shared Dashboard Links">
          <p>If you generate a shareable dashboard link, anyone with that link can view a read-only summary of your budget and spending. This link does not expose your name, email, or account credentials. You can revoke access by generating a new link from your account settings.</p>
        </Section>

        <Section title="9. Your Rights">
          <ul className="list-disc list-inside space-y-1.5 ml-2">
            <li><strong className="text-stone-700">Access:</strong> You can view all your data within the app dashboard at any time.</li>
            <li><strong className="text-stone-700">Correction:</strong> You can edit or delete any data you have entered.</li>
            <li><strong className="text-stone-700">Deletion:</strong> You can request full account and data deletion by emailing <a href="mailto:mantrabudget@gmail.com" className="text-orange-600 hover:underline">mantrabudget@gmail.com</a>. We will process requests within 30 days.</li>
            <li><strong className="text-stone-700">Data portability:</strong> You can export your transactions and budget data as an Excel file from the app.</li>
          </ul>
        </Section>

        <Section title="10. Cookies">
          <p>BudgetMantra does not use tracking or advertising cookies. We use a local storage token (JWT) solely to keep you logged in between sessions. This is not shared with any third party.</p>
        </Section>

        <Section title="11. Children's Privacy">
          <p>BudgetMantra is not intended for users under 18 years of age. We do not knowingly collect data from minors. If you believe a minor has created an account, please contact us and we will delete it promptly.</p>
        </Section>

        <Section title="12. Changes to This Policy">
          <p>We may update this policy as the product evolves. When we make material changes, we will notify you via email or an in-app banner. Continued use of BudgetMantra after changes constitutes acceptance of the updated policy.</p>
        </Section>

        <Section title="13. Contact Us">
          <p>For any privacy-related questions, requests, or concerns:</p>
          <p><strong className="text-stone-700">Email:</strong> <a href="mailto:mantrabudget@gmail.com" className="text-orange-600 hover:underline">mantrabudget@gmail.com</a></p>
          <p>We aim to respond to all privacy queries within 5 business days.</p>
        </Section>

      </div>

      <div className="mt-8 text-center text-xs text-stone-400">
        © 2026 Budget Mantra · <Link to="/terms" className="hover:text-orange-500 transition-colors">Terms of Service</Link> · <a href="mailto:mantrabudget@gmail.com" className="hover:text-orange-500 transition-colors">Contact</a>
      </div>
    </div>
  </div>
);

export default PrivacyPolicy;
