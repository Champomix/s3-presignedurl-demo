import { expect, test, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { EndpointSelector } from './EndpointSelector.jsx';

const endpoints = [
  {
    id: 'rustfs-local', name: 'RustFS local', region: 'us-east-1', bucket: 'demo-bucket',
    buckets: [{ name: 'demo-bucket', writeOnly: false }, { name: 'drop-bucket', writeOnly: true }],
  },
  { id: 'aws', name: 'AWS', region: 'eu-west-1', bucket: 'my-bucket', buckets: [{ name: 'my-bucket', writeOnly: false }] },
];

const renderSelector = (props) => render(
  <EndpointSelector endpoints={endpoints} value="rustfs-local" onChange={() => {}} bucket="demo-bucket" onBucketChange={() => {}} {...props} />,
);

test('affiche nom et région de chaque endpoint, et les buckets de l\'endpoint choisi', () => {
  renderSelector();
  expect(screen.getByRole('option', { name: 'RustFS local - us-east-1' })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'AWS - eu-west-1' })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'demo-bucket' })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'drop-bucket (écriture seule)' })).toBeInTheDocument();
});

test('remonte l\'id sélectionné', () => {
  const onChange = vi.fn();
  renderSelector({ onChange });
  fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'aws' } });
  expect(onChange).toHaveBeenCalledWith('aws');
});

test('remonte le bucket sélectionné', () => {
  const onBucketChange = vi.fn();
  renderSelector({ onBucketChange });
  fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'drop-bucket' } });
  expect(onBucketChange).toHaveBeenCalledWith('drop-bucket');
});
