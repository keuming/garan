import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { ErrorBox, Field } from '../components/ui.jsx';
import { LABELS } from '../format.js';

export function Profile() {
  const { admin, setAdmin, logout } = useAuth();
  const [info, setInfo] = useState({ full_name: admin.full_name, email: admin.email, current_password: '' });
  const [pw, setPw] = useState({ current_password: '', new_password: '', confirm: '' });
  const [saved, setSaved] = useState(false);

  const saveInfo = useMutation({
    mutationFn: () =>
      api.patch('/admin/me', {
        full_name: info.full_name !== admin.full_name ? info.full_name : undefined,
        email: info.email !== admin.email ? info.email : undefined,
        current_password: info.current_password
      }),
    onSuccess: ({ admin: a }) => {
      setAdmin({ ...admin, ...a });
      setInfo({ full_name: a.full_name, email: a.email, current_password: '' });
      setSaved(true);
    }
  });

  const changePw = useMutation({
    mutationFn: () => api.post('/admin/me/password', { current_password: pw.current_password, new_password: pw.new_password }),
    onSuccess: async () => {
      window.alert('Mot de passe modifié. Reconnectez-vous avec le nouveau mot de passe.');
      await logout();
    }
  });

  const changed = info.full_name !== admin.full_name || info.email !== admin.email;
  const mismatch = pw.confirm.length > 0 && pw.new_password !== pw.confirm;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Mon profil</h1>
          <p>{LABELS.role[admin.role]} · identifiant de connexion : <strong>{admin.email}</strong></p>
        </div>
      </div>

      <div className="two-col" style={{ alignItems: 'start' }}>
        <form
          className="card"
          style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
          onSubmit={(e) => {
            e.preventDefault();
            setSaved(false);
            saveInfo.mutate();
          }}
        >
          <h2>Informations et identifiant</h2>
          <ErrorBox error={saveInfo.error} />
          {saved ? <div className="alert success">Profil mis à jour.</div> : null}
          <Field label="Nom complet" id="p-name">
            <input id="p-name" className="input" required value={info.full_name} onChange={(e) => setInfo({ ...info, full_name: e.target.value })} />
          </Field>
          <Field label="E-mail de connexion (login)" id="p-email">
            <input id="p-email" className="input" type="email" required value={info.email} onChange={(e) => setInfo({ ...info, email: e.target.value })} />
          </Field>
          <Field label="Mot de passe actuel (pour confirmer)" id="p-cur">
            <input id="p-cur" className="input" type="password" autoComplete="current-password" required value={info.current_password} onChange={(e) => setInfo({ ...info, current_password: e.target.value })} />
          </Field>
          <button className="btn" type="submit" disabled={!changed || saveInfo.isPending}>
            Enregistrer
          </button>
        </form>

        <form
          className="card"
          style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
          onSubmit={(e) => {
            e.preventDefault();
            changePw.mutate();
          }}
        >
          <h2>Mot de passe</h2>
          <ErrorBox error={changePw.error} />
          <Field label="Mot de passe actuel" id="pw-cur">
            <input id="pw-cur" className="input" type="password" autoComplete="current-password" required value={pw.current_password} onChange={(e) => setPw({ ...pw, current_password: e.target.value })} />
          </Field>
          <Field label="Nouveau mot de passe (10 caractères minimum)" id="pw-new">
            <input id="pw-new" className="input" type="password" autoComplete="new-password" minLength={10} required value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} />
          </Field>
          <Field label="Confirmer le nouveau mot de passe" id="pw-conf">
            <input id="pw-conf" className="input" type="password" autoComplete="new-password" required value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
          </Field>
          {mismatch ? <div className="alert error">Les deux mots de passe ne correspondent pas.</div> : null}
          <p className="muted small" style={{ margin: 0 }}>Toutes vos sessions ouvertes seront fermées après le changement.</p>
          <button className="btn" type="submit" disabled={mismatch || pw.new_password.length < 10 || changePw.isPending}>
            Changer le mot de passe
          </button>
        </form>
      </div>
    </>
  );
}
