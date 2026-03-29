import { Link } from 'react-router-dom';
import { Wallet, ArrowLeft, FileText } from 'lucide-react';

const Section = ({ title, children }) => (
  <div className="mb-10">
    <h2 className="text-xl font-bold text-stone-800 font-['Outfit'] mb-4 pb-2 border-b border-stone-100">{title}</h2>
    <div className="space-y-3 text-stone-600 text-sm leading-relaxed">{children}</div>
  </div>
);

const TermsOfService = () => (
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
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-orange-50 border border-orange-200 rounded-full mb-4">
          <FileText size={14} className="text-orange-600" />
          <span className="text-sm font-medium text-orange-700">Please read carefully before using BudgetMantra</span>
        </div>
        <h1 className="text-4xl font-bold text-stone-900 font-['Outfit'] mb-3">Terms of Service</h1>
        <p className="text-stone-500">Last updated: March 2026 &nbsp;·&nbsp; Effective date: March 2026</p>
      </div>

      <div className="bg-white rounded-3xl border border-stone-100 shadow-sm p-8 lg:p-12">

        <Section title="1. Acceptance of Terms">
          <p>By creating an account or using BudgetMantra ("the Service", "the App"), you agree to be bound by these Terms of Service. If you do not agree, please do not use BudgetMantra.</p>
          <p>These terms apply to all users of the Service, including visitors, registered users, and Pro subscribers.</p>
        </Section>

        <Section title="2. Description of Service">
          <p>BudgetMantra is a personal finance tracking application that allows users to:</p>
          <ul className="list-disc list-inside space-y-1.5 ml-2">
            <li>Manually track income, expenses, and budgets</li>
            <li>Monitor EMI loans and repayment progress</li>
            <li>Set and track savings goals</li>
            <li>Receive AI-generated financial insights via Chanakya AI (powered by Anthropic's Claude)</li>
            <li>View a Financial Health Score based on self-reported data</li>
            <li>Share a read-only budget summary via a secure link</li>
          </ul>
          <p><strong className="text-stone-700">BudgetMantra is a tracking tool only.</strong> It does not connect to your bank, process payments, or execute financial transactions on your behalf.</p>
        </Section>

        <Section title="3. Eligibility">
          <p>You must be at least 18 years of age to use BudgetMantra. By using the Service, you represent that you are 18 or older and have the legal capacity to enter into this agreement.</p>
        </Section>

        <Section title="4. Account Registration">
          <p>You are responsible for maintaining the confidentiality of your account credentials. You agree to:</p>
          <ul className="list-disc list-inside space-y-1.5 ml-2">
            <li>Provide accurate and complete information during registration</li>
            <li>Keep your password secure and not share it with others</li>
            <li>Notify us immediately at <a href="mailto:mantrabudget@gmail.com" className="text-orange-600 hover:underline">mantrabudget@gmail.com</a> if you suspect unauthorised access</li>
            <li>Accept responsibility for all activity under your account</li>
          </ul>
        </Section>

        <Section title="5. Acceptable Use">
          <p>You agree to use BudgetMantra only for lawful personal finance tracking purposes. You must not:</p>
          <ul className="list-disc list-inside space-y-1.5 ml-2">
            <li>Use the Service for any unlawful purpose or in violation of any Indian or applicable laws</li>
            <li>Attempt to gain unauthorised access to another user's account or data</li>
            <li>Reverse engineer, decompile, or attempt to extract the source code of the application</li>
            <li>Use automated bots, scrapers, or scripts to access the Service</li>
            <li>Upload malicious code, viruses, or any harmful content</li>
            <li>Use the Service to conduct money laundering or any fraudulent financial activity</li>
            <li>Impersonate BudgetMantra or its team members</li>
          </ul>
        </Section>

        <Section title="6. Chanakya AI — Important Disclaimer">
          <p>Chanakya AI is an <strong className="text-stone-700">informational assistant</strong> powered by Anthropic's Claude AI. Its responses are based on the budget and EMI data you have entered.</p>
          <p><strong className="text-stone-700">Chanakya AI does not constitute financial, investment, tax, or legal advice.</strong> The information provided is for educational and planning purposes only. BudgetMantra is not a SEBI-registered investment advisor.</p>
          <p>You should always consult a qualified, SEBI-registered financial advisor before making significant financial decisions. BudgetMantra and its team are not liable for any financial outcomes arising from actions taken based on Chanakya AI suggestions.</p>
        </Section>

        <Section title="7. Data Accuracy">
          <p>BudgetMantra relies entirely on data you manually enter. We make no guarantees about the accuracy, completeness, or suitability of any calculations, scores, or recommendations generated from your self-reported data.</p>
          <p>Your Financial Health Score is a relative indicator based on your inputs and general RBI guidelines. It is not an official financial rating.</p>
        </Section>

        <Section title="8. Free and Pro Plans">
          <p>BudgetMantra offers a free plan and a paid Pro plan. The features available on each plan are described on our Pricing page and may be updated from time to time.</p>
          <p>For Pro subscribers: payments are non-refundable except where required by applicable law. We reserve the right to change pricing with 30 days' notice to existing subscribers.</p>
          <p>We do not process payments directly — payments are handled by our payment processor (Razorpay). Your card or UPI details are collected and stored by Razorpay, not by BudgetMantra.</p>
        </Section>

        <Section title="9. Intellectual Property">
          <p>All content, features, branding, and code within BudgetMantra are the intellectual property of Budget Mantra and are protected under applicable Indian copyright and trademark laws.</p>
          <p>You retain ownership of the financial data you enter. By using the Service, you grant us a limited licence to process and display that data solely for the purpose of providing the Service to you.</p>
        </Section>

        <Section title="10. Termination">
          <p>You may delete your account at any time by contacting us at <a href="mailto:mantrabudget@gmail.com" className="text-orange-600 hover:underline">mantrabudget@gmail.com</a>. Upon deletion, your data will be permanently removed within 30 days.</p>
          <p>We reserve the right to suspend or terminate accounts that violate these Terms, with or without prior notice, depending on the severity of the violation.</p>
        </Section>

        <Section title="11. Limitation of Liability">
          <p>To the fullest extent permitted by law, BudgetMantra and its team shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the Service, including but not limited to:</p>
          <ul className="list-disc list-inside space-y-1.5 ml-2">
            <li>Financial decisions made based on app data or Chanakya AI responses</li>
            <li>Loss of data due to technical failure</li>
            <li>Unauthorised access to your account due to your failure to keep credentials secure</li>
            <li>Service interruptions or downtime</li>
          </ul>
          <p>Our total liability to you for any claim shall not exceed the amount you paid us in the 3 months preceding the claim (or ₹0 if you are on a free plan).</p>
        </Section>

        <Section title="12. Indemnification">
          <p>You agree to indemnify and hold harmless BudgetMantra and its team from any claims, damages, or expenses (including legal fees) arising from your violation of these Terms or your use of the Service in a manner not authorised herein.</p>
        </Section>

        <Section title="13. Governing Law & Disputes">
          <p>These Terms are governed by the laws of India. Any disputes arising from these Terms or your use of BudgetMantra shall be subject to the exclusive jurisdiction of the courts in India.</p>
          <p>We encourage you to contact us first at <a href="mailto:mantrabudget@gmail.com" className="text-orange-600 hover:underline">mantrabudget@gmail.com</a> to resolve any disputes informally before pursuing legal action.</p>
        </Section>

        <Section title="14. Changes to These Terms">
          <p>We may update these Terms as the Service evolves. Material changes will be communicated via email or an in-app notification at least 14 days before taking effect. Continued use of the Service after that date constitutes acceptance.</p>
        </Section>

        <Section title="15. Contact">
          <p>If you have any questions about these Terms, please reach out:</p>
          <p><strong className="text-stone-700">Email:</strong> <a href="mailto:mantrabudget@gmail.com" className="text-orange-600 hover:underline">mantrabudget@gmail.com</a></p>
        </Section>

      </div>

      <div className="mt-8 text-center text-xs text-stone-400">
        © 2026 Budget Mantra · <Link to="/privacy" className="hover:text-orange-500 transition-colors">Privacy Policy</Link> · <a href="mailto:mantrabudget@gmail.com" className="hover:text-orange-500 transition-colors">Contact</a>
      </div>
    </div>
  </div>
);

export default TermsOfService;
