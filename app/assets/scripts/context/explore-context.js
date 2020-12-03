import React, { createContext, useEffect, useState, useReducer } from 'react';
import T from 'prop-types';
import * as topojson from 'topojson-client';
import bbox from '@turf/bbox';
import bboxPolygon from '@turf/bbox-polygon';

import { featureCollection } from '@turf/helpers';
import useQsState from '../utils/qs-state-hook';
// import { randomRange } from '../utils/utils';

import config from '../config';

import areasJson from '../../data/areas.json';

import { initialApiRequestState } from './contexeed';
import { fetchZonesReducer, fetchZones } from './reducers/zones';
// import { fetchFilterRanges, filterRangesReducer } from './reducers/filter-ranges';
// import { fetchFilters, filtersReducer } from './reducers/filters';
// import { fetchWeights, weightsReducer } from './reducers/weights';
// import { fetchLcoe, lcoeReducer } from './reducers/lcoe';

// import { fetchInputLayers, inputLayersReducer } from './reducers/layers';

import {
  showGlobalLoading,
  hideGlobalLoading
} from '../components/common/global-loading';

import {
  INPUT_CONSTANTS,
  // presets as defaultPresets,
  checkIncluded
} from '../components/explore/panel-data';

const { GRID_OPTIONS, SLIDER, BOOL } = INPUT_CONSTANTS;

const ExploreContext = createContext({});

// const presets = { ...defaultPresets };

export function ExploreProvider (props) {
  // const [mapLayers, setMapLayers] = useState([]);
  const [maxZoneScore, setMaxZoneScore] = useQsState({
    key: 'maxZoneScore',
    default: undefined,
    hydrator: v => {
      if (v) {
        const [min, max] = v.split(',').map(Number);
        return { min, max };
      } else {
        return { min: 0, max: 1 };
      }
    },

    dehydrator: v => {
      return v && `${v.min},${v.max}`;
    }
  });
  /*
  const [maxLCOE, setMaxLCOE] = useQsState({
    key: 'maxLCOE',
    default: undefined,
    hydrator: v => {
      if (v) {
        const [min, max] = v.split(',').map(Number);
        return { min, max };
      } else {
        return { min: 0, max: 1 };
      }
    },
    dehydrator: v => v && `${v.min},${v.max}`
  }); */

  // Init areas state
  const [areas, setAreas] = useState([]);
  const [selectedArea, setSelectedArea] = useState(null);
  const [selectedAreaId, setSelectedAreaId] = useQsState({
    key: 'areaId',
    default: undefined
  });
  const [showSelectAreaModal, setShowSelectAreaModal] = useState(
    !selectedAreaId
  );

  // Handle selected area id changes
  useEffect(() => {
    // Clear current zones
    dispatchCurrentZones({ type: 'INVALIDATE_FETCH_ZONES' });

    // Set area object to context
    setSelectedArea(areas.find((a) => a.id === selectedAreaId));
  }, [selectedAreaId]);

  const [selectedResource, setSelectedResource] = useQsState({
    key: 'resourceId',
    default: undefined
  });

  const [showSelectResourceModal, setShowSelectResourceModal] = useState(
    !selectedResource
  );

  useEffect(() => {
    setShowSelectAreaModal(!selectedAreaId);
    setShowSelectResourceModal(!selectedResource);
  }, [selectedAreaId, selectedResource]);

  const [gridMode, setGridMode] = useState(false);
  const [gridSize, setGridSize] = useState(GRID_OPTIONS[0]);

  const [tourStep, setTourStep] = useState(0);

  const initAreasAndFilters = async () => {
    showGlobalLoading();
    // Parse region and country files into area list
    const eez = await fetch('public/zones/eez_v11.topojson').then((e) =>
      e.json()
    );
    const { features: eezFeatures } = topojson.feature(
      eez,
      eez.objects.eez_v11
    );
    const eezCountries = eezFeatures.reduce((accum, z) => {
      const id = z.properties.ISO_TER1;
      accum.set(id, [...(accum.has(id) ? accum.get(id) : []), z]);
      return accum;
    }, new Map());

    setAreas(
      areasJson.map((a) => {
        if (a.type === 'country') {
          a.id = a.gid;
          a.eez = eezCountries.get(a.id);
        }

        // Parse bounds, if a string
        if (a.bounds && typeof a.bounds === 'string') {
          a.bounds = a.bounds.split(',').map((x) => parseFloat(x));
        }

        return a;
      })
    );
    hideGlobalLoading();
  };

  useEffect(() => {
    let nextArea = areas.find((a) => `${a.id}` === `${selectedAreaId}`);

    if (selectedResource === 'Off-Shore Wind' && nextArea) {
      const initBounds = bboxPolygon(nextArea.bounds);
      const eezs = nextArea.eez ? nextArea.eez : [];
      const fc = featureCollection([initBounds, ...eezs]);
      const newBounds = bbox(fc);
      nextArea = {
        ...nextArea,
        bounds: newBounds
      };
      setGridMode(true);
    }

    setSelectedArea(nextArea);
  }, [areas, selectedAreaId, selectedResource]);

  // Executed on page mount
  useEffect(() => {
    const visited = localStorage.getItem('site-tour');
    if (visited !== null) {
      setTourStep(Number(visited));
    }

    initAreasAndFilters();
    // fetchInputLayers(dispatchInputLayers);
  }, []);

  useEffect(() => {
    localStorage.setItem('site-tour', tourStep);
  }, [tourStep]);

  const [currentZones, dispatchCurrentZones] = useReducer(
    fetchZonesReducer,
    initialApiRequestState
  );

  const generateZones = async (filterString, weights, lcoe) => {
    showGlobalLoading();
    fetchZones(
      gridMode && gridSize,
      selectedArea,
      filterString,
      weights,
      lcoe,
      dispatchCurrentZones
    );
  };

  const [filteredLayerUrl, setFilteredLayerUrl] = useState(null);
  const [lcoeLayerUrl, setLcoeLayerUrl] = useState(null);

  function updateFilteredLayer (filterValues, weights, lcoe) {
    // Prepare a query string to the API based from filter values
    const filterString = filterValues
      .map((filter) => {
        const { id, active, input } = filter;

        // Bypass inactive filters
        if (!active || !checkIncluded(filter, selectedResource)) return null;

        // Add accepted filter types to the query
        if (input.type === SLIDER) {
          const {
            value: { min, max }
          } = filter.input;
          return `${id}=${min},${max}`;
        } else if (input.type === BOOL) {
          return `${id}=${filter.input.value}`;
        }

        // discard non-accepted filter types
        return null;
      })
      .filter((x) => x)
      .join('&');

    // Apply filter querystring to the map
    const basePath = selectedArea.type === 'country' ? `/filter/${selectedArea.id}` : '/filter';
    setFilteredLayerUrl(
      `${config.apiEndpoint}${basePath}/{z}/{x}/{y}.png?${filterString}&color=54,166,244,80`
    );

    const lcoeReduction = Object.entries(lcoe).reduce((accum, [key, value]) => `${accum}&${key}=${value}`, '');

    setLcoeLayerUrl(
      `${config.apiEndpoint}/lcoe/{z}/{x}/{y}.png?${filterString}&${lcoeReduction}&colormap=cool`
    );

    generateZones(filterString, weights, lcoe);
  }

  return (
    <>
      <ExploreContext.Provider
        value={{

          areas,

          // output filters
          maxZoneScore,
          setMaxZoneScore,
          /* maxLCOE,
          setMaxLCOE */

          /* explore context */

          selectedArea,
          selectedAreaId,
          setSelectedAreaId,
          selectedResource,
          setSelectedResource,

          showSelectAreaModal,
          setShowSelectAreaModal,
          showSelectResourceModal,
          setShowSelectResourceModal,

          gridMode,
          setGridMode,
          gridSize,
          setGridSize,

          currentZones,
          generateZones,

          filteredLayerUrl,
          updateFilteredLayer,
          lcoeLayerUrl,
          tourStep,
          setTourStep
        }}
      >
        {props.children}
      </ExploreContext.Provider>
    </>
  );
}

ExploreProvider.propTypes = {
  children: T.node
};

export default ExploreContext;
