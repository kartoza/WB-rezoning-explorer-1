import React from 'react';
import T from 'prop-types';
import styled from 'styled-components';

import { ModalHeader as LibraryModalHeader } from '@devseed-ui/modal';

const HeaderWrapper = styled(LibraryModalHeader)`
  display: grid;
  grid-template-columns: 1fr;
`;

const Headline = styled.h1`
  text-align: center; 
`;

export const ModalHeader = ({ title, children }) => {
  return (
    <HeaderWrapper>
      <Headline>{title}</Headline>
      {children}
    </HeaderWrapper>

  );
};

ModalHeader.propTypes = {
  title: T.string,
  children: T.node
};