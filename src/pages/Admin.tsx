import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert, Trash2, Ban, CheckCircle, Search, UserX } from 'lucide-react';

export default function Admin() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setCurrentUser(JSON.parse(storedUser));
    }
  }, []);

  const fetchUsers = async () => {
    if (!currentUser) return;
    try {
      const res = await fetch('/api/admin/users', {
        headers: { 'x-admin-role': currentUser.role }
      });
      const data = await res.json();
      setUsers(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser) {
      fetchUsers();
    }
  }, [currentUser]);

  const handleStatusChange = async (id: number, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'banned' : 'active';
    try {
      const res = await fetch(`/api/admin/users/${id}/status`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-role': currentUser.role
        },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setUsers(users.map((u) => (u.id === id ? { ...u, status: newStatus } : u)));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRoleChange = async (id: number, newRole: string) => {
    try {
      const res = await fetch(`/api/admin/users/${id}/role`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-role': currentUser.role
        },
        body: JSON.stringify({ role: newRole }),
      });
      if (res.ok) {
        setUsers(users.map((u) => (u.id === id ? { ...u, role: newRole } : u)));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
      return;
    }
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'DELETE',
        headers: { 'x-admin-role': currentUser.role }
      });
      if (res.ok) {
        setUsers(users.filter((u) => u.id !== id));
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (!currentUser || (currentUser.role !== 'admin' && currentUser.role !== 'moderator')) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center text-center px-4">
        <ShieldAlert className="w-16 h-16 text-zinc-800 mb-6" />
        <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
        <p className="text-zinc-500 mb-8">You do not have permission to view this page.</p>
        <Link to="/" className="text-orange-500 hover:text-orange-400 font-medium">
          Back to Home
        </Link>
      </div>
    );
  }

  const filteredUsers = users.filter((u) => 
    u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (u.rider_name && u.rider_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (u.company_name && u.company_name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (loading) {
    return (
      <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] py-12 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2 flex items-center gap-3">
            <ShieldAlert className="w-8 h-8 text-orange-500" />
            Admin Dashboard
          </h1>
          <p className="text-zinc-400">Manage users, access control, and moderation.</p>
        </div>
        
        <div className="relative">
          <Search className="w-5 h-5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search users..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full sm:w-80 bg-zinc-900 border border-white/10 rounded-xl py-2 pl-10 pr-4 text-white focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition-all"
          />
        </div>
      </div>

      <div className="bg-zinc-900/50 border border-white/5 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 bg-zinc-900">
                <th className="p-4 font-semibold text-zinc-400 text-sm">User</th>
                <th className="p-4 font-semibold text-zinc-400 text-sm">Type</th>
                <th className="p-4 font-semibold text-zinc-400 text-sm">Role</th>
                <th className="p-4 font-semibold text-zinc-400 text-sm">Joined</th>
                <th className="p-4 font-semibold text-zinc-400 text-sm">Status</th>
                <th className="p-4 font-semibold text-zinc-400 text-sm text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-zinc-500">
                    <UserX className="w-8 h-8 mx-auto mb-3 opacity-50" />
                    No users found.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-white/[0.02] transition-colors">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <img 
                          src={user.profile_picture_url} 
                          alt="" 
                          className="w-10 h-10 rounded-full object-cover bg-zinc-800"
                          referrerPolicy="no-referrer"
                        />
                        <div>
                          <div className="font-medium text-zinc-100">
                            {user.type === 'rider' ? user.rider_name : user.company_name}
                          </div>
                          <div className="text-sm text-zinc-500">@{user.username}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize bg-zinc-800 text-zinc-300">
                        {user.type}
                      </span>
                    </td>
                    <td className="p-4">
                      <select
                        value={user.role}
                        onChange={(e) => handleRoleChange(user.id, e.target.value)}
                        className="bg-zinc-800 text-zinc-300 text-xs rounded-lg border border-white/10 px-2 py-1 focus:outline-none focus:border-orange-500"
                      >
                        <option value="user">User</option>
                        <option value="moderator">Moderator</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td className="p-4 text-sm text-zinc-400">
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                    <td className="p-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                        user.status === 'active' 
                          ? 'bg-emerald-500/10 text-emerald-400' 
                          : 'bg-red-500/10 text-red-400'
                      }`}>
                        {user.status === 'active' ? <CheckCircle className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                        {user.status}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleStatusChange(user.id, user.status)}
                          className={`p-2 rounded-lg transition-colors ${
                            user.status === 'active' 
                              ? 'text-zinc-400 hover:text-red-400 hover:bg-red-500/10' 
                              : 'text-zinc-400 hover:text-emerald-400 hover:bg-emerald-500/10'
                          }`}
                          title={user.status === 'active' ? 'Ban User' : 'Unban User'}
                        >
                          {user.status === 'active' ? <Ban className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => handleDelete(user.id)}
                          className="p-2 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                          title="Delete User"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
