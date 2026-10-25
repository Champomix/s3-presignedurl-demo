import { expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { EndpointSelector } from './EndpointSelector.jsx';

const endpoints = [
  { id: 'rustfs-local', name: 'RustFS local', region: 'us-east-1', bucket: 'demo-bucket' },
  { id: 'aws', name: 'AWS', region: 'eu-west-1', bucket: 'my-bucket' },
];

test('affiche nom, région et bucket de chaque endpoint', () => {
  render(<EndpointSelector endpoints={endpoints} value="rustfs-local" onChange={() => {}} />);
  expect(screen.getByRole('option', { name: 'RustFS local - us-east-1 - demo-bucket' })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'AWS - eu-west-1 - my-bucket' })).toBeInTheDocument();
});

test('remonte l\'id sélectionné', () => {
  const onChange = vi.fn();
  render(<EndpointSelector endpoints={endpoints} value="rustfs-local" onChange={onChange} />);
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'aws' } });
  expect(onChange).toHaveBeenCalledWith('aws');
});
