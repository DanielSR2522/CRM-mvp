const fs = require('fs');
const path = require('path');

const targetFile = path.join(__dirname, '../src/components/address/GoogleAddressAutocomplete.tsx');

const code = `'use client';

import React, { useEffect, useRef, useState } from 'react';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';

export interface NormalizedAddress {
  streetAddress: string;
  addressLine2?: string;
  city: string;
  county?: string;
  state: string;
  postalCode: string;
  country: string;
  placeId?: string;
  latitude?: number;
  longitude?: number;
}

interface GoogleAddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onAddressSelected?: (address: NormalizedAddress) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  name?: string;
  required?: boolean;
}

let isOptionsConfigured = false;

function initOptions() {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey) return false;

  if (!isOptionsConfigured) {
    setOptions({
      key: apiKey,
      v: 'weekly',
    });
    isOptionsConfigured = true;
  }
  return true;
}

export function parseGooglePlace(place: google.maps.places.PlaceResult): NormalizedAddress {
  const components = place.address_components || [];

  let streetNumber = '';
  let route = '';
  let locality = '';
  let postalTown = '';
  let sublocality = '';
  let adminAreaLevel2 = '';
  let adminAreaLevel1 = '';
  let postalCode = '';
  let postalCodeSuffix = '';
  let country = '';

  components.forEach((component) => {
    const types = component.types || [];
    if (types.includes('street_number')) {
      streetNumber = component.long_name;
    }
    if (types.includes('route')) {
      route = component.long_name;
    }
    if (types.includes('locality')) {
      locality = component.long_name;
    }
    if (types.includes('postal_town')) {
      postalTown = component.long_name;
    }
    if (types.includes('sublocality_level_1') || types.includes('sublocality')) {
      sublocality = component.long_name;
    }
    if (types.includes('administrative_area_level_2')) {
      adminAreaLevel2 = component.long_name;
    }
    if (types.includes('administrative_area_level_1')) {
      adminAreaLevel1 = component.short_name || component.long_name;
    }
    if (types.includes('postal_code')) {
      postalCode = component.long_name;
    }
    if (types.includes('postal_code_suffix')) {
      postalCodeSuffix = component.long_name;
    }
    if (types.includes('country')) {
      country = component.long_name;
    }
  });

  // Construct street address: street_number + route
  let streetAddress = '';
  if (streetNumber && route) {
    streetAddress = \`\${streetNumber} \${route}\`;
  } else if (route) {
    streetAddress = route;
  } else if (place.name && place.name !== locality) {
    streetAddress = place.name;
  } else {
    streetAddress = place.formatted_address || '';
  }

  // Construct city with fallbacks
  const city = locality || postalTown || sublocality || adminAreaLevel2 || '';

  // Construct postal code with optional suffix
  const fullPostalCode = postalCodeSuffix ? \`\${postalCode}-\${postalCodeSuffix}\` : postalCode;

  // Lat / Lng coordinates
  const lat = place.geometry?.location ? place.geometry.location.lat() : undefined;
  const lng = place.geometry?.location ? place.geometry.location.lng() : undefined;

  return {
    streetAddress,
    city,
    county: adminAreaLevel2,
    state: adminAreaLevel1,
    postalCode: fullPostalCode,
    country: country || 'United States',
    placeId: place.place_id,
    latitude: lat,
    longitude: lng,
  };
}

export default function GoogleAddressAutocomplete({
  value,
  onChange,
  onAddressSelected,
  placeholder = 'Start typing street address...',
  disabled = false,
  className = 'crm-input w-full',
  id,
  name,
  required = false,
}: GoogleAddressAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const listenerRef = useRef<google.maps.MapsEventListener | null>(null);

  const onChangeRef = useRef(onChange);
  const onAddressSelectedRef = useRef(onAddressSelected);

  const [googleError, setGoogleError] = useState<string | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
    onAddressSelectedRef.current = onAddressSelected;
  }, [onChange, onAddressSelected]);

  useEffect(() => {
    const configured = initOptions();
    if (!configured) {
      return;
    }

    let isMounted = true;

    // Handle global Google Maps auth failure events gracefully
    if (typeof window !== 'undefined') {
      const prevHandler = (window as any).gm_authFailure;
      (window as any).gm_authFailure = () => {
        if (prevHandler) prevHandler();
        if (isMounted) {
          setGoogleError('Google Maps API Key Error (Check domain restrictions or billing)');
        }
      };
    }

    importLibrary('places')
      .then((placesLib: any) => {
        if (!isMounted || !inputRef.current) return;

        if (listenerRef.current) {
          google.maps.event.removeListener(listenerRef.current);
          listenerRef.current = null;
        }

        const options: google.maps.places.AutocompleteOptions = {
          types: ['address'],
          componentRestrictions: { country: 'us' },
          fields: ['address_components', 'formatted_address', 'geometry', 'place_id', 'name'],
        };

        const autocomplete = new placesLib.Autocomplete(inputRef.current, options);
        autocompleteRef.current = autocomplete;

        const listener = autocomplete.addListener('place_changed', () => {
          const place = autocomplete.getPlace();
          if (!place || !place.address_components) return;

          const parsed = parseGooglePlace(place);

          if (parsed.streetAddress) {
            onChangeRef.current(parsed.streetAddress);
          } else if (place.formatted_address) {
            onChangeRef.current(place.formatted_address);
          }

          if (onAddressSelectedRef.current) {
            onAddressSelectedRef.current(parsed);
          }
        });

        listenerRef.current = listener;
      })
      .catch((err: any) => {
        console.warn('[GoogleAddressAutocomplete] importLibrary error:', err?.message || err);
        if (isMounted) {
          setGoogleError(\`Google Places Error: \${err?.message || 'Failed to load places library'}\`);
        }
      });

    return () => {
      isMounted = false;
      if (listenerRef.current) {
        google.maps.event.removeListener(listenerRef.current);
        listenerRef.current = null;
      }
    };
  }, []);

  return (
    <div className="relative w-full">
      <input
        ref={inputRef}
        type="text"
        id={id}
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        className={className}
        autoComplete="off"
      />
      {googleError && (
        <span className="block text-[10px] text-amber-600 font-semibold mt-1" title={googleError}>
          ⚠️ {googleError} (Manual editing available)
        </span>
      )}
    </div>
  );
}
`;

fs.writeFileSync(targetFile, code, 'utf-8');
console.log('Successfully updated GoogleAddressAutocomplete to use setOptions and importLibrary!');
