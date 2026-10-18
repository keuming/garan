import { Field } from './ui.jsx';

export const COUNTRIES = ["Côte d'Ivoire", 'Burkina Faso', 'Mali', 'Sénégal', 'Togo', 'Bénin', 'Niger', 'Guinée', 'Cameroun', 'Gabon'];

/** Nettoie un objet de formulaire : chaînes vides → undefined (champs facultatifs). */
export const clean = (o) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'string' && v.trim() === '' ? undefined : v]));

/** Pays / ville / quartier. */
export function LocationFields({ value, onChange, prefix }) {
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value });
  return (
    <div className="form-row">
      <Field label="Pays" id={`${prefix}-country`}>
        <select id={`${prefix}-country`} className="input" value={value.country} onChange={set('country')}>
          {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </Field>
      <Field label="Ville" id={`${prefix}-city`}>
        <input id={`${prefix}-city`} className="input" required value={value.city} onChange={set('city')} />
      </Field>
      <Field label="Quartier" id={`${prefix}-district`}>
        <input id={`${prefix}-district`} className="input" required value={value.district} onChange={set('district')} />
      </Field>
    </div>
  );
}

/** Informations d'une boutique (sous-compte CLIENT). */
export function ShopFields({ value, onChange, prefix = 'shop' }) {
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value });
  return (
    <>
      <div className="form-row">
        <Field label="Nom de la boutique" id={`${prefix}-name`}>
          <input id={`${prefix}-name`} className="input" required value={value.name} onChange={set('name')} />
        </Field>
        <Field label="Contact de la boutique" id={`${prefix}-phone`}>
          <input id={`${prefix}-phone`} className="input" type="tel" required value={value.phone} onChange={set('phone')} />
        </Field>
      </div>
      <div className="form-row">
        <Field label="E-mail (facultatif)" id={`${prefix}-email`}>
          <input id={`${prefix}-email`} className="input" type="email" value={value.email ?? ''} onChange={set('email')} />
        </Field>
        <Field label="RCCM (facultatif)" id={`${prefix}-rccm`}>
          <input id={`${prefix}-rccm`} className="input" value={value.rccm ?? ''} onChange={set('rccm')} />
        </Field>
      </div>
      <LocationFields value={value} onChange={onChange} prefix={prefix} />
      <Field label="Adresse (facultatif)" id={`${prefix}-address`}>
        <input id={`${prefix}-address`} className="input" value={value.address ?? ''} onChange={set('address')} />
      </Field>
    </>
  );
}

/** Compte de connexion mobile : nom, login (téléphone), code PIN. */
export function AccountFields({ value, onChange, prefix = 'acc', pinLabel = 'Code PIN (4 chiffres)', pinRequired = true }) {
  const set = (k) => (e) => onChange({ ...value, [k]: k === 'pin' ? e.target.value.replace(/\D/g, '').slice(0, 4) : e.target.value });
  return (
    <div className="form-row">
      <Field label="Nom complet" id={`${prefix}-fn`}>
        <input id={`${prefix}-fn`} className="input" required value={value.full_name} onChange={set('full_name')} />
      </Field>
      <Field label="Login (numéro de téléphone)" id={`${prefix}-phone`}>
        <input id={`${prefix}-phone`} className="input" type="tel" required value={value.phone} onChange={set('phone')} />
      </Field>
      <Field label={pinLabel} id={`${prefix}-pin`}>
        <input
          id={`${prefix}-pin`}
          className="input mono"
          inputMode="numeric"
          autoComplete="off"
          pattern="\d{4}"
          required={pinRequired}
          value={value.pin}
          onChange={set('pin')}
        />
      </Field>
    </div>
  );
}

export const EMPTY_SHOP = { name: '', phone: '', email: '', rccm: '', country: "Côte d'Ivoire", city: 'Abidjan', district: '', address: '' };
export const EMPTY_ACCOUNT = { full_name: '', phone: '', pin: '' };
