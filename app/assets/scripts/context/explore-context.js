import React, { createContext, useEffect, useState, useReducer } from 'react';
import T from 'prop-types';
import * as topojson from 'topojson-client';
import bbox from '@turf/bbox';
import bboxPolygon from '@turf/bbox-polygon';

import { featureCollection } from '@turf/helpers';
import useQsState from '../utils/qs-state-hook';
import { randomRange } from '../utils/utils';

import config from '../config';

import areasJson from '../../data/areas.json';

import { fetchZonesReducer, fetchZones } from './fetch-zones';

import {
  showGlobalLoading,
  hideGlobalLoading
} from '../components/common/global-loading';
import {
  INPUT_CONSTANTS,
  presets as defaultPresets
} from '../components/explore/panel-data';

import { initialApiRequestState } from './contexeed';
import { fetchJSON } from './reduxeed';
const { GRID_OPTIONS, SLIDER } = INPUT_CONSTANTS;

const ExploreContext = createContext({});

const presets = { ...defaultPresets };
export function ExploreProvider (props) {
  const [filtersLists, setFiltersLists] = useState(null);

  const [selectedArea, setSelectedArea] = useState(null);

  const [selectedAreaId, setSelectedAreaId] = useQsState({
    key: 'areaId',
    default: undefined
  });

  const [showSelectAreaModal, setShowSelectAreaModal] = useState(
    !selectedAreaId
  );

  const [areas, setAreas] = useState([]);

  const [map, setMap] = useState(null);

  useEffect(() => {
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

    // Fetch filters from API
    const { body: filters } = await fetchJSON(
      `${config.apiEndpoint}/filter/schema`
    );

    // Filter data structure from API doesn't match current
    // frontend implementation, the following try to fix this.
    const apiFilters = {
      distance_filters: Object.keys(filters).map((filterId) => {
        const filter = filters[filterId];
        return {
          ...filter,
          id: filterId,
          name: filter.title,
          info: filter.description,
          isRange: filter.pattern === 'range_filter',
          input: {
            type: SLIDER,
            range: [0, 1000000],
            isRange: true
          }
        };
      })
    };

    // Apply a mock "Optimization" scenario to filter presets, just random numbers
    presets.filters = {
      Optimization: Object.entries(apiFilters).reduce(
        (accum, [name, group]) => {
          return {
            ...accum,
            [name]: group.map((filter) => ({
              ...filter,
              input: {
                ...filter.input,
                value: {
                  max: filter.range
                    ? randomRange(filter.range[0], filter.range[1])
                    : randomRange(0, 100),
                  min: filter.range ? filter.range[0] : 0
                }
              }
            }))
          };
        },
        {}
      )
    };

    // Add to filters context
    setFiltersLists(apiFilters);

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
        a.bounds = a.bounds
          ? a.bounds.split(',').map((x) => parseFloat(x))
          : null;
        return a;
      })
    );
    hideGlobalLoading();
  };

  useEffect(() => {
    setSelectedArea(areas.find((a) => a.id === selectedAreaId));
  }, [selectedAreaId]);

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
  }, []);

  useEffect(() => {
    localStorage.setItem('site-tour', tourStep);
  }, [tourStep]);

  useEffect(() => {
    dispatchCurrentZones({ type: 'INVALIDATE_FETCH_ZONES' });
  }, [selectedAreaId]);

  const [inputTouched, setInputTouched] = useState(true);
  const [zonesGenerated, setZonesGenerated] = useState(false);

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

  useEffect(() => {
    if (currentZones.fetched) {
      hideGlobalLoading();
      !zonesGenerated && setZonesGenerated(true);
      setInputTouched(false);
    }
  }, [currentZones]);

  const [filteredLayerUrl, setFilteredLayerUrl] = useState(null);

  function updateFilteredLayer (filterValues, weights, lcoe) {
    const filterString = filterValues
      .map(({ min, max }) => `${min},${max}`)
      .join('|');
    setFilteredLayerUrl(
      `${config.apiEndpoint}/filter/{z}/{x}/{y}.png?filters=${filterString}&color=54,166,244,80`
    );
    generateZones(filterString, weights, lcoe);
  }

  return (
    <>
      <ExploreContext.Provider
        value={{
          map,
          setMap,
          areas,
          filtersLists,
          presets,
          selectedArea,
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
          inputTouched,
          setInputTouched,
          zonesGenerated,
          setZonesGenerated,
          filteredLayerUrl,
          updateFilteredLayer,
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
