import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { Banner, Button, Card, ErrorBanner, Input, Muted, Screen, Select, Title } from './ui';
import { ProtectedHero } from './ProtectedHero';
import { colors } from '../lib/theme';

const OPERATORS = [
  { value: 'ORANGE', label: 'Orange Money' },
  { value: 'MTN', label: 'MTN MoMo' },
  { value: 'MOOV', label: 'Moov Money' },
  { value: 'WAVE', label: 'Wave' }
];

const FINAL = ['SUCCESS', 'FAILED', 'CANCELLED', 'EXPIRED', 'REFUNDED'];

/**
 * Paiement ORZAYAH par dépôt Mobile Money.
 * `onStart({operator, account_number})` initie et renvoie { payment_id, status, next_action }.
 * `onPoll(payment_id)` renvoie l'état ; on sonde jusqu'à un statut final.
 * `onSuccess(result)` est appelé une fois le paiement confirmé.
 */
export function OrzayahPay({ title, sub, amountLabel, onStart, onPoll, onSuccess }) {
  const [operator, setOperator] = useState('ORANGE');
  const [number, setNumber] = useState('');
  const [phase, setPhase] = useState('form'); // form | pending | done | failed
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);
  const timer = useRef(null);
  const paymentId = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  function statusOf(r) {
    return r?.deposit_status ?? r?.status ?? null;
  }

  async function poll() {
    try {
      const r = await onPoll(paymentId.current);
      const s = statusOf(r);
      setInfo(r);
      if (r?.status === 'SUCCESS' || r?.applied || s === 'SUCCESS' || r?.status === 'settled') {
        setPhase('done');
        onSuccess?.(r);
        return;
      }
      if (['FAILED', 'CANCELLED', 'EXPIRED'].includes(s) || r?.status === 'failed') {
        setPhase('failed');
        setError(new Error(r?.failure_reason || 'Paiement non abouti. Réessayez.'));
        return;
      }
      timer.current = setTimeout(poll, 4000); // toujours en attente de confirmation
    } catch (e) {
      timer.current = setTimeout(poll, 5000); // relecture impossible : on réessaie
    }
  }

  async function pay() {
    setError(null);
    setPhase('pending');
    try {
      const r = await onStart({ operator, account_number: number });
      paymentId.current = r.payment_id;
      setInfo(r);
      timer.current = setTimeout(poll, 3500);
    } catch (e) {
      setPhase('form');
      setError(e);
    }
  }

  const ready = /^\d{8,15}$/.test(number);

  return (
    <Screen>
      <Title sub={sub}>{title}</Title>
      <Card style={{ backgroundColor: colors.green, alignItems: 'center', gap: 2 }}>
        <Text style={{ color: '#042f1f', fontWeight: '800', fontSize: 13, textTransform: 'uppercase' }}>Montant</Text>
        <Text style={{ color: '#042a1c', fontSize: 30, fontWeight: '900' }}>{amountLabel}</Text>
      </Card>

      {phase === 'form' || phase === 'failed' ? (
        <Card>
          <Muted>Payer par Mobile Money</Muted>
          <Select label="Opérateur" value={operator} options={OPERATORS} onChange={setOperator} />
          <Input label="Numéro Mobile Money à débiter" value={number} onChangeText={(t) => setNumber(t.replace(/\D/g, '').slice(0, 15))} keyboardType="phone-pad" placeholder="Ex. 0700000000" />
          <ErrorBanner error={error} />
          <Button title="Payer maintenant" onPress={pay} disabled={!ready} />
          <Muted>Vous recevrez une demande de confirmation sur ce numéro (code USSD / notification). Validez-la pour finaliser.</Muted>
        </Card>
      ) : null}

      {phase === 'pending' ? (
        <Card style={{ alignItems: 'center', gap: 10 }}>
          <Banner tone="info" title="En attente de votre confirmation">
            {info?.next_action?.message || 'Confirmez le paiement sur votre téléphone (code USSD ou notification Mobile Money). Cet écran se met à jour automatiquement.'}
          </Banner>
          <Muted>Ne fermez pas cette page…</Muted>
        </Card>
      ) : null}

      {phase === 'done' ? (
        <>
          <ProtectedHero
            tone="protected"
            eyebrow="Paiement confirmé"
            title="Vous êtes protégé"
            subtitle="Votre abonnement gaRAN est actif. Merci pour votre confiance."
          />
          <Button title="Continuer" onPress={() => onSuccess?.(info, true)} />
        </>
      ) : null}
    </Screen>
  );
}
