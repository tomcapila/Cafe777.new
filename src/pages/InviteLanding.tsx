import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, LogIn, Loader2, Link as LinkIcon, BadgeCheck, ShieldCheck } from 'lucide-react';

export default function InviteLanding() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [sponsor, setSponsor] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchInvite = async () => {
      try {
        const res = await fetch(`/api/invites/${code}/verify`);
        const data = await res.json();
        
        if (data.valid) {
          setSponsor(data.sponsor);
        } else {
          setError(data.error || 'Invalid or expired invite link.');
        }
      } catch (err) {
        setError('Error verifying invite link.');
      } finally {
        setLoading(false);
      }
    };
    if (code) {
      fetchInvite();
    }
  }, [code]);

  if (loading) {
    return (
      <div className="min-h-screen pt-24 pb-20 flex items-center justify-center bg-engine">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-24 pb-20 px-6 max-w-md mx-auto">
      <div className="mb-8 flex justify-center">
        <div className="bg-primary/20 p-4 rounded-full border border-primary/30">
          <LinkIcon className="w-12 h-12 text-primary" />
        </div>
      </div>

      <div className="bg-oil rounded-3xl p-8 border border-inverse/10 shadow-2xl relative overflow-hidden">
        {/* Aesthetic accents */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/20 blur-3xl rounded-full translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-info/20 blur-3xl rounded-full -translate-x-1/2 translate-y-1/2" />
        
        <div className="relative z-10 text-center space-y-6">
          {error ? (
            <div className="space-y-4">
              <h2 className="text-2xl font-display font-black text-chrome uppercase">Invite Not Found</h2>
              <p className="text-steel">{error}</p>
              <Link to="/" className="w-full bg-primary text-white rounded-xl px-4 py-4 flex items-center justify-center font-bold hover:bg-white transition-colors">Go to Homepage</Link>
            </div>
          ) : (
            <>
              <h2 className="text-3xl font-display font-black text-chrome uppercase leading-tight">
                You're Invited!
              </h2>
              
              <div className="bg-engine rounded-2xl p-4 border border-inverse/5 flex items-center gap-4 text-left">
                <img 
                  src={sponsor?.profile_picture_url || `https://ui-avatars.com/api/?name=${sponsor?.username}&background=random`} 
                  alt={sponsor?.username} 
                  className="w-14 h-14 rounded-full object-cover border-2 border-primary/30"
                />
                <div>
                  <div className="text-sm text-steel mb-1">Invited by Ambassador</div>
                  <div className="text-chrome font-bold flex items-center gap-1">
                    @{sponsor?.username}
                    <BadgeCheck className="w-4 h-4 text-primary" />
                  </div>
                </div>
              </div>

              <p className="text-sm text-steel">
                Cafe777 is the ultimate platform for motorcycle enthusiasts.
              </p>

              <div className="space-y-4 pt-4">
                <Link 
                  to={`/onboarding?ref=${code}`} 
                  className="w-full bg-primary text-inverse rounded-xl px-4 py-4 flex items-center justify-between font-bold hover:bg-primary/90 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <ShieldCheck className="w-5 h-5 text-inverse group-hover:scale-110 transition-transform" />
                    Accept Invite & Register
                  </div>
                  <ArrowRight className="w-4 h-4 text-inverse group-hover:translate-x-1 transition-transform" />
                </Link>
                <div className="text-center pt-2">
                  <span className="text-steel text-xs">Already have an account? </span>
                  <Link to={`/login?ref=${code}`} className="text-primary hover:underline text-xs font-bold">
                    Log in here
                  </Link>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
