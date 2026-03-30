import React from 'react';

const LoadingUI = ({ title = 'Please wait', subtitle = 'Preparing your experience...' }) => {
  return (
    <main className='app-loading' aria-live='polite' aria-busy='true'>
      <section className='app-loading__content'>
        <div className='app-loading__orbit'>
          <span className='app-loading__ring app-loading__ring--outer' />
          <span className='app-loading__ring app-loading__ring--inner' />
          <span className='app-loading__core' />
        </div>
        <h1 className='app-loading__title'>{title}</h1>
        <p className='app-loading__subtitle'>{subtitle}</p>
      </section>
    </main>
  );
};

export default LoadingUI;
