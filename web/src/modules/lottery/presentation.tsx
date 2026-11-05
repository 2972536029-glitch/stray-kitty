import {createContext,useContext} from 'react';
import {postalPresentation} from './presentationModel';

export const PostalPresentationContext=createContext(postalPresentation);
export const usePostalPresentation=()=>useContext(PostalPresentationContext);
