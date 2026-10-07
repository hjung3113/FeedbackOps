import { fireEvent, render, screen } from '@testing-library/react';
import { Combobox } from '../combobox.js';

describe('Combobox accessible labels', () => {
  it('uses its configured listbox label and empty text', () => {
    render(
      <Combobox
        options={[]}
        value={null}
        onChange={() => {}}
        placeholder="Choose an option"
        listboxLabel="Available options"
        emptyText="No matching options"
      />,
    );
    fireEvent.click(screen.getByRole('combobox'));

    expect(screen.getByRole('listbox', { name: 'Available options' })).toBeInTheDocument();
    expect(screen.getByText('No matching options')).toBeInTheDocument();
  });
});

describe('Combobox filterOptions (#821 fix1)', () => {
  const OPTIONS = [
    { value: 'voc-12', label: 'VOC-12 · 로그인 오류' },
    { value: 'voc-13', label: 'VOC-13 · 결제 화면이 느림' },
  ];

  it('with filterOptions={false}, an option whose label does not contain the typed text is still listed', () => {
    render(
      <Combobox
        options={OPTIONS}
        value={null}
        onChange={() => {}}
        filterOptions={false}
        listboxLabel="옵션"
      />,
    );
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.change(screen.getByPlaceholderText('검색…'), { target: { value: ' voc-12 ' } });

    // The padded search matches no label substring; the server-searched row
    // must still be listed exactly as returned.
    expect(screen.getByRole('option', { name: 'VOC-12 · 로그인 오류' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'VOC-13 · 결제 화면이 느림' })).toBeInTheDocument();
  });

  it('defaults to client-filtering option labels by the typed search', () => {
    render(<Combobox options={OPTIONS} value={null} onChange={() => {}} listboxLabel="옵션" />);
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.change(screen.getByPlaceholderText('검색…'), { target: { value: ' voc-12 ' } });

    expect(screen.queryByRole('option', { name: 'VOC-12 · 로그인 오류' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: 'VOC-13 · 결제 화면이 느림' }),
    ).not.toBeInTheDocument();
  });
});
