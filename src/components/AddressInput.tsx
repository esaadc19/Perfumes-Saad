export default function AddressInput({
  value,
  onChange,
  label = "Dirección de entrega",
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  return (
    <label className="auth-label">
      {label}
      <input
        className="address-input"
        name="delivery_address"
        aria-label={label}
        type="text"
        autoComplete="street-address"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Escribe tu dirección de entrega"
      />
    </label>
  );
}
