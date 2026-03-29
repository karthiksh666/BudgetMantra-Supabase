import { useState, useCallback } from 'react';
import { useStaleData } from '@/hooks/useStaleData';
import Navigation from '@/components/Navigation';
import PageLoader from '@/components/PageLoader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import axios from 'axios';
import { API } from '@/App';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import { Users, UserPlus, Mail, CheckCircle, Crown, Shield, Sparkles } from 'lucide-react';

const Skeleton = ({ className }) => <div className={`animate-pulse bg-stone-200 rounded-lg ${className}`} />;

const FamilyManagement = () => {
  const { user } = useAuth();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [groupName, setGroupName]               = useState('');
  const [inviteEmail, setInviteEmail]           = useState('');

  const fetchMembersFn = useCallback(async () => {
    const res = await axios.get(`${API}/family/members`);
    return res.data.members || [];
  }, []);
  const { data: members, loading, reload: fetchMembers } = useStaleData(
    'bm_family_cache',
    fetchMembersFn,
    { fallback: [] },
  );

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/family/create`, { name: groupName });
      toast.success('Family group created!');
      setIsCreateDialogOpen(false);
      setGroupName('');
      fetchMembers();
      window.location.reload();
    } catch {
      toast.error('Failed to create family group');
    }
  };

  const handleInviteMember = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/family/invite`, { email: inviteEmail });
      toast.success(`Invitation sent to ${inviteEmail}`);
      setIsInviteDialogOpen(false);
      setInviteEmail('');
      fetchMembers();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to invite member');
    }
  };

  const hasFamily = user?.family_group_id;

  if (loading) return (
    <>
      <Navigation />
      <div className="min-h-[calc(100vh-80px)] bg-[#fffaf5] flex items-center justify-center">
        <PageLoader
          message="Loading family data…"
          tips={["Fetching members", "Checking permissions"]}
        />
      </div>
    </>
  );

  return (
    <>
      <Navigation />
      <div className="min-h-[calc(100vh-80px)] bg-[#fffaf5]" data-testid="family-management-page">
        <div className="max-w-3xl mx-auto px-4 lg:px-6 py-6">

          {/* ── Header ── */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-stone-900 font-['Outfit']">Family</h1>
              <p className="text-stone-400 text-sm mt-0.5">Share budgets &amp; expenses with loved ones</p>
            </div>
            {hasFamily ? (
              <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    data-testid="invite-member-btn"
                    className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 shadow-sm shadow-orange-300/40"
                  >
                    <UserPlus size={16} className="mr-1.5" /> Invite Member
                  </Button>
                </DialogTrigger>
                <DialogContent data-testid="invite-dialog" onOpenAutoFocus={e => e.preventDefault()}>
                  <DialogHeader>
                    <DialogTitle>Invite Family Member</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleInviteMember} className="space-y-4 mt-2">
                    <div>
                      <Label className="text-sm font-medium text-stone-700">Email Address</Label>
                      <Input
                        id="invite-email"
                        type="email"
                        data-testid="invite-email-input"
                        value={inviteEmail}
                        onChange={e => setInviteEmail(e.target.value)}
                        placeholder="spouse@example.com"
                        required
                        className="mt-1.5"
                      />
                      <p className="text-xs text-stone-400 mt-1.5">They must already have a Budget Mantra account.</p>
                    </div>
                    <div className="flex gap-3 pt-1">
                      <Button type="submit" data-testid="send-invite-btn" className="flex-1 bg-gradient-to-r from-orange-500 to-orange-600">
                        Send Invite
                      </Button>
                      <Button type="button" variant="outline" onClick={() => setIsInviteDialogOpen(false)}>
                        Cancel
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            ) : (
              <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    data-testid="create-family-btn"
                    className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 shadow-sm shadow-orange-300/40"
                  >
                    <Users size={16} className="mr-1.5" /> Create Group
                  </Button>
                </DialogTrigger>
                <DialogContent data-testid="create-dialog" onOpenAutoFocus={e => e.preventDefault()}>
                  <DialogHeader>
                    <DialogTitle>Create Family Group</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleCreateGroup} className="space-y-4 mt-2">
                    <div>
                      <Label className="text-sm font-medium text-stone-700">Group Name</Label>
                      <Input
                        id="group-name"
                        data-testid="group-name-input"
                        value={groupName}
                        onChange={e => setGroupName(e.target.value)}
                        placeholder="e.g., The Sharma Family"
                        required
                        className="mt-1.5"
                      />
                    </div>
                    <div className="flex gap-3 pt-1">
                      <Button type="submit" data-testid="create-group-btn" className="flex-1 bg-gradient-to-r from-orange-500 to-orange-600">
                        Create Group
                      </Button>
                      <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                        Cancel
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </div>

          {/* ── No family yet ── */}
          {!hasFamily ? (
            <div className="space-y-4">
              {/* Hero empty state */}
              <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-10 text-center">
                <div className="w-16 h-16 bg-orange-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Users size={30} className="text-orange-400" />
                </div>
                <h2 className="text-xl font-bold text-stone-800 font-['Outfit'] mb-2">No Family Group Yet</h2>
                <p className="text-stone-400 text-sm max-w-sm mx-auto mb-6">
                  Create a family group to share budgets, track expenses together, and manage finances with your spouse or family members.
                </p>
                <Button
                  onClick={() => setIsCreateDialogOpen(true)}
                  data-testid="create-family-cta"
                  className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 shadow-md shadow-orange-300/40"
                >
                  <Users size={16} className="mr-1.5" /> Create Family Group
                </Button>
              </div>

              {/* Feature highlights */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { icon: Shield,   label: 'Shared budgets',         desc: 'One budget, two eyes' },
                  { icon: Sparkles, label: 'Combined view',           desc: 'All expenses in one place' },
                  { icon: Users,    label: 'Joint EMI tracking',      desc: 'Never miss a payment' },
                  { icon: Crown,    label: 'Family health score',     desc: 'How you\'re doing together' },
                ].map(({ icon: Icon, label, desc }) => (
                  <div key={label} className="bg-white rounded-xl border border-stone-100 shadow-sm p-4 flex items-start gap-3">
                    <div className="w-8 h-8 bg-orange-50 rounded-lg flex items-center justify-center shrink-0">
                      <Icon size={16} className="text-orange-500" />
                    </div>
                    <div>
                      <p className="font-semibold text-stone-700 text-sm">{label}</p>
                      <p className="text-xs text-stone-400 mt-0.5">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* ── Has family ── */
            <div className="space-y-4">
              {/* Members card */}
              <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-bold text-stone-800 font-['Outfit']">
                    Family Members
                    <span className="ml-2 text-sm font-medium text-stone-400">({members.length})</span>
                  </h2>
                </div>

                {loading ? (
                  <div className="space-y-3">
                    {[0,1].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}
                  </div>
                ) : members.length === 0 ? (
                  <div className="text-center py-6 text-stone-400 text-sm">
                    No members yet. Invite someone to join!
                  </div>
                ) : (
                  <div className="space-y-2">
                    {members.map(member => (
                      <div
                        key={member.id}
                        data-testid={`member-${member.id}`}
                        className="flex items-center gap-3 p-3 bg-stone-50 rounded-xl"
                      >
                        {/* Avatar */}
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center shrink-0">
                          <span className="text-white font-bold text-base">
                            {member.name.charAt(0).toUpperCase()}
                          </span>
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-stone-800 text-sm">{member.name}</span>
                            {member.id === user?.id && (
                              <span className="text-[10px] bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full font-semibold">You</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 text-xs text-stone-400 mt-0.5">
                            <Mail size={11} />
                            <span className="truncate">{member.email}</span>
                          </div>
                        </div>

                        <CheckCircle size={18} className="text-emerald-500 shrink-0" />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Features card */}
              <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 p-5 text-white shadow-lg shadow-orange-300/40">
                <div className="absolute -top-6 -right-6 w-32 h-32 bg-white/10 rounded-full blur-2xl pointer-events-none" />
                <div className="relative">
                  <p className="font-bold text-base font-['Outfit'] mb-3 flex items-center gap-2">
                    <Sparkles size={16} /> Family Features
                  </p>
                  <ul className="space-y-1.5 text-sm text-white/80">
                    {['Shared budget tracking', 'Combined expense view', 'Joint EMI management', 'Family transaction history', 'Consolidated financial health score'].map(f => (
                      <li key={f} className="flex items-center gap-2">
                        <CheckCircle size={13} className="text-white/60 shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-4 text-xs text-white/60 italic">
                    All members can view and manage shared finances. Perfect for couples!
                  </p>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
};

export default FamilyManagement;
