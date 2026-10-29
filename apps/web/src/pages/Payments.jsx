import { Link } from 'react-router-dom';
import { PaymentsOverview } from '../components/PaymentsOverview.jsx';

/** Page dédiée « Abonnements & paiements » : sort le tableau détaillé du tableau de bord. */
export function Payments() {
  return (
    <>
      <div className="page-head">
        <div>
          <Link to="/" className="small">← Tableau de bord</Link>
          <h1 style={{ marginTop: 6 }}>Abonnements &amp; paiements</h1>
          <p>Comptes payés / non payés, encaissements, paiements ORZAYAH et solde du compte.</p>
        </div>
      </div>
      <PaymentsOverview />
    </>
  );
}
