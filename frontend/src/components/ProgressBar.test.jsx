import { expect, test } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProgressBar } from './ProgressBar.jsx';

test('affiche le pourcentage', () => {
  const { container } = render(<ProgressBar loaded={50} total={200} />);
  expect(screen.getByText('25 %')).toBeInTheDocument();
  expect(container.querySelector('progress')).toHaveAttribute('value', '25');
});

test('progression indéterminée si la taille est inconnue', () => {
  const { container } = render(<ProgressBar loaded={50} total={0} />);
  expect(screen.getByText('en cours...')).toBeInTheDocument();
  expect(container.querySelector('progress')).not.toHaveAttribute('value');
});
