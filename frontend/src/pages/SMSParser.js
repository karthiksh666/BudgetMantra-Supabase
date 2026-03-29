import { useState } from 'react';
import Navigation from '@/components/Navigation';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import axios from 'axios';
import { API } from '@/App';
import { toast } from 'sonner';
import { MessageSquare, Sparkles, ArrowRight } from 'lucide-react';

const SMSParser = () => {
  const [smsText, setSmsText] = useState('');
  const [parsedData, setParsedData] = useState(null);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchCategories = async () => {
    try {
      const response = await axios.get(`${API}/categories`);
      setCategories(response.data);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  useState(() => {
    fetchCategories();
  }, []);

  const handleParseSMS = async () => {
    if (!smsText.trim()) {
      toast.error('Please paste an SMS text');
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(`${API}/sms/parse`, { sms_text: smsText });
      setParsedData(response.data);
      
      // Auto-select matching category if available
      const matchingCat = categories.find(c => 
        c.name.toLowerCase().includes(response.data.suggested_category)
      );
      if (matchingCat) {
        setSelectedCategory(matchingCat.id);
      }
      
      toast.success('SMS parsed successfully!');
    } catch (error) {
      console.error('Error parsing SMS:', error);
      toast.error('Failed to parse SMS');
    } finally {
      setLoading(false);
    }
  };

  const handleAddTransaction = async () => {
    if (!parsedData || !selectedCategory) {
      toast.error('Please select a category');
      return;
    }

    try {
      await axios.post(`${API}/transactions`, {
        category_id: selectedCategory,
        amount: parsedData.amount,
        description: parsedData.description,
        date: parsedData.date,
        source: 'sms'
      });
      
      toast.success('Transaction added from SMS!');
      setSmsText('');
      setParsedData(null);
      setSelectedCategory('');
    } catch (error) {
      console.error('Error adding transaction:', error);
      toast.error('Failed to add transaction');
    }
  };

  return (
    <>
      <Navigation />
      <div className="page-container" data-testid="sms-parser-page">
        <div className="page-header">
          <h1 className="page-title">SMS Auto-Tracker</h1>
          <p className="page-subtitle">Paste bank transaction SMS to automatically add expenses</p>
        </div>

        <div className="content-grid" style={{ gridTemplateColumns: '1fr' }}>
          <div className="card">
            <h2 className="card-title">
              <MessageSquare size={24} style={{ marginRight: '8px', display: 'inline' }} />
              Paste SMS Message
            </h2>
            
            <div className="form-group">
              <Label htmlFor="sms-text">Bank Transaction SMS</Label>
              <textarea
                id="sms-text"
                data-testid="sms-input"
                className="form-input"
                rows={6}
                value={smsText}
                onChange={(e) => setSmsText(e.target.value)}
                placeholder="Example: Your A/c XX1234 debited with Rs.2,500.00 on 19-Oct-24 at AMAZON INDIA. Avl bal Rs.45,678.90"
                style={{ fontFamily: 'monospace', resize: 'vertical' }}
              />
            </div>

            <Button
              onClick={handleParseSMS}
              disabled={loading || !smsText.trim()}
              data-testid="parse-sms-btn"
            >
              <Sparkles size={18} style={{ marginRight: '8px' }} />
              {loading ? 'Parsing...' : 'Parse SMS'}
            </Button>

            {parsedData && (
              <div className="parsed-result" style={{ marginTop: '2rem', padding: '1.5rem', background: '#f5f5f5', borderRadius: '8px' }}>
                <h3 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', color: '#26a69a' }}>
                  <Sparkles size={20} style={{ marginRight: '8px' }} />
                  Parsed Transaction
                </h3>
                
                <div className="parsed-details" style={{ display: 'grid', gap: '1rem' }}>
                  <div>
                    <div style={{ fontSize: '0.875rem', color: '#666', marginBottom: '4px' }}>Amount</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#0288d1' }}>
                      ₹{parsedData.amount?.toLocaleString()}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '0.875rem', color: '#666', marginBottom: '4px' }}>Type</div>
                    <div style={{ 
                      display: 'inline-block',
                      padding: '4px 12px',
                      borderRadius: '4px',
                      background: parsedData.type === 'expense' ? '#ffebee' : '#e8f5e9',
                      color: parsedData.type === 'expense' ? '#e53935' : '#26a69a',
                      fontWeight: '600',
                      textTransform: 'capitalize'
                    }}>
                      {parsedData.type}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '0.875rem', color: '#666', marginBottom: '4px' }}>Description</div>
                    <div style={{ fontWeight: '500' }}>{parsedData.description}</div>
                  </div>

                  <div>
                    <div style={{ fontSize: '0.875rem', color: '#666', marginBottom: '4px' }}>Date</div>
                    <div>{parsedData.date}</div>
                  </div>

                  <div className="form-group">
                    <Label htmlFor="category-select">Select Category</Label>
                    <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                      <SelectTrigger data-testid="category-select">
                        <SelectValue placeholder="Choose a category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories
                          .filter(c => c.type === parsedData.type)
                          .map((cat) => (
                            <SelectItem key={cat.id} value={cat.id} data-testid={`category-${cat.id}`}>
                              {cat.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    {parsedData.suggested_category && (
                      <p style={{ fontSize: '0.75rem', color: '#666', marginTop: '4px' }}>
                        💡 Suggested: {parsedData.suggested_category}
                      </p>
                    )}
                  </div>

                  <Button
                    onClick={handleAddTransaction}
                    disabled={!selectedCategory}
                    data-testid="add-transaction-btn"
                  >
                    Add Transaction
                    <ArrowRight size={18} style={{ marginLeft: '8px' }} />
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="card" style={{ background: '#e3f2fd', border: '1px solid #90caf9' }}>
            <h3 style={{ marginBottom: '1rem', color: '#0288d1' }}>💡 How to Use</h3>
            <ol style={{ paddingLeft: '1.5rem', lineHeight: '1.8', color: '#424242' }}>
              <li>Copy transaction SMS from your bank</li>
              <li>Paste it in the text area above</li>
              <li>Click "Parse SMS" to extract details</li>
              <li>Review and select the correct category</li>
              <li>Click "Add Transaction" to save</li>
            </ol>
            <p style={{ marginTop: '1rem', fontSize: '0.875rem', color: '#666' }}>
              Supports all major Indian banks including SBI, HDFC, ICICI, Axis, and more!
            </p>
          </div>
        </div>
      </div>
    </>
  );
};

export default SMSParser;
